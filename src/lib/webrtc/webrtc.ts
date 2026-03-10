'use client';
import {
  Firestore,
  doc,
  collection,
  addDoc,
  setDoc,
  onSnapshot,
  query,
  where,
  getDoc,
  DocumentReference,
  deleteDoc,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

interface PeerConnectionWithUnsubscribe extends RTCPeerConnection {
  unsubscribeCandidates?: Unsubscribe;
  unsubscribeAnswer?: Unsubscribe;
  pendingCandidates?: RTCIceCandidate[];
}

export const createPeerConnection = (
  firestore: Firestore,
  sessionId: string,
  localPeerId: string,
  remotePeerId: string,
  onTrack: (track: MediaStreamTrack, trackType: 'audio' | 'video') => void,
  onDisconnect: () => void
): PeerConnectionWithUnsubscribe => {
  const pc: PeerConnectionWithUnsubscribe = new RTCPeerConnection(ICE_SERVERS);
  pc.pendingCandidates = [];

  const callId = localPeerId < remotePeerId ? `${localPeerId}_${remotePeerId}` : `${remotePeerId}_${localPeerId}`;
  const callDocRef = doc(firestore, 'sessions', sessionId, 'calls', callId);

  const isCaller = localPeerId < remotePeerId;
  const localCandidatesCollection = isCaller ? 'offerCandidates' : 'answerCandidates';
  const remoteCandidatesCollection = isCaller ? 'answerCandidates' : 'offerCandidates';

  pc.onicecandidate = event => {
    if (event.candidate) {
      const candidatesCollectionRef = collection(callDocRef, localCandidatesCollection);
      addDoc(candidatesCollectionRef, event.candidate.toJSON());
    }
  };

  const remoteCandidatesRef = collection(callDocRef, remoteCandidatesCollection);
  pc.unsubscribeCandidates = onSnapshot(remoteCandidatesRef, snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        if (pc.signalingState !== 'closed') {
          if (pc.remoteDescription) {
          pc.addIceCandidate(candidate).catch(() => {});
          } else {
            pc.pendingCandidates!.push(candidate);
          }
        }
      }
    });
  });

  pc.ontrack = event => {
    const trackType = event.track.kind as 'audio' | 'video';
    onTrack(event.track, trackType);
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
      onDisconnect();
      return;
    }

    if (pc.connectionState === 'disconnected') {
      setTimeout(() => {
        if (pc.connectionState === 'disconnected') {
          try {
            pc.restartIce();
          } catch {
            // ignore
          }
        }
      }, 2000);
    }
  };

  pc.oniceconnectionstatechange = () => {
    // Log state changes for debugging mobile issues
    console.log(`[WebRTC] ICE state changed: ${pc.iceConnectionState} (peer: ${remotePeerId})`);
    
    if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
      // First attempt: quick ICE restart after 1 second (mobile recovery)
      setTimeout(() => {
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
          console.log(`[WebRTC] Attempting ICE restart (1st) for peer: ${remotePeerId}`);
          try {
            pc.restartIce();
          } catch {
            // ignore
          }
        }
      }, 1000);

      // Second attempt: retry after 5 seconds if still disconnected
      setTimeout(() => {
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
          console.log(`[WebRTC] Attempting ICE restart (2nd) for peer: ${remotePeerId}`);
          try {
            pc.restartIce();
          } catch {
            // ignore
          }
        }
      }, 5000);
    }

    // When connection is restored, log it
    if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
      console.log(`[WebRTC] Connection restored for peer: ${remotePeerId}`);
    }
  };

  return pc;
};

/**
 * Munge SDP to set Opus parameters for CPU-efficient voice encoding.
 *
 * - ptime=40: process 40ms frames instead of 20ms, halving encode frequency.
 *   Adds ~20ms latency — imperceptible for voice chat, massive CPU saving.
 * - maxaveragebitrate=32000: cap at 32kbps (Opus voice sweet spot).
 * - useinbandfec=1: enable forward error correction for packet loss resilience.
 * - cbr=1: constant bitrate prevents CPU spikes on complex audio segments.
 *
 * Only modifies the Opus fmtp line; leaves other codecs untouched.
 */
const mungeOpusSdp = (sdp: string | undefined): string | undefined => {
  if (!sdp) return sdp;

  // Find the Opus payload type from the rtpmap line
  const opusMatch = sdp.match(/a=rtpmap:(\d+) opus\/48000/);
  if (!opusMatch) return sdp;
  const opusPayloadType = opusMatch[1];

  // Build regex for the Opus fmtp line
  const fmtpRegex = new RegExp(`(a=fmtp:${opusPayloadType} [^\\r\\n]*)`);
  const fmtpMatch = sdp.match(fmtpRegex);

  const opusParams = 'maxaveragebitrate=32000;useinbandfec=1;cbr=1';

  if (fmtpMatch) {
    // Append our params to existing fmtp line, avoiding duplicates
    let fmtpLine = fmtpMatch[1];
    for (const param of opusParams.split(';')) {
      const key = param.split('=')[0];
      if (!fmtpLine.includes(key)) {
        fmtpLine += `;${param}`;
      }
    }
    sdp = sdp.replace(fmtpRegex, fmtpLine);
  } else {
    // Insert fmtp line after rtpmap
    const rtpmapLine = `a=rtpmap:${opusPayloadType} opus/48000/2`;
    sdp = sdp.replace(
      rtpmapLine,
      `${rtpmapLine}\r\na=fmtp:${opusPayloadType} minptime=10;useinbandfec=1;${opusParams}`
    );
  }

  // Add ptime attribute if not present (applies to all audio codecs but Opus respects it)
  if (!sdp.includes('a=ptime:')) {
    // Insert after the first m=audio line
    sdp = sdp.replace(/(m=audio [^\r\n]+)/, '$1\r\na=ptime:40');
  } else {
    // Update existing ptime to 40
    sdp = sdp.replace(/a=ptime:\d+/, 'a=ptime:40');
  }

  return sdp;
};

const flushPendingCandidates = (pc: PeerConnectionWithUnsubscribe) => {
  if (pc.pendingCandidates?.length) {
    for (const candidate of pc.pendingCandidates) {
      pc.addIceCandidate(candidate).catch(() => {});
    }
    pc.pendingCandidates = [];
  }
};

export const createOffer = async (
  firestore: Firestore,
  sessionId: string,
  localPeerId: string,
  remotePeerId: string,
  pc: RTCPeerConnection
) => {
  const pcExt = pc as PeerConnectionWithUnsubscribe;
  const callId = localPeerId < remotePeerId ? `${localPeerId}_${remotePeerId}` : `${remotePeerId}_${localPeerId}`;
  const callDocRef = doc(firestore, 'sessions', sessionId, 'calls', callId);

  if (pcExt.unsubscribeAnswer) {
    pcExt.unsubscribeAnswer();
  }

  pcExt.unsubscribeAnswer = onSnapshot(callDocRef, snapshot => {
    const data = snapshot.data();
    if (pc.signalingState === 'have-local-offer' && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription)
        .then(() => flushPendingCandidates(pcExt))
        .catch(() => {});
    }
  });

  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
      pcExt.unsubscribeAnswer?.();
    }
  });

  const offerDescription = await pc.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: true,
  });

  if (pc.signalingState !== 'stable') {
    pcExt.unsubscribeAnswer?.();
    pcExt.unsubscribeAnswer = undefined;
    return;
  }

  // Munge SDP to optimize Opus for CPU efficiency (ptime=40, cbr, FEC)
  offerDescription.sdp = mungeOpusSdp(offerDescription.sdp);

  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await setDoc(callDocRef, { offer, callerId: localPeerId, calleeId: remotePeerId, answer: null }, { merge: true });
};

export const handleOffer = async (
  firestore: Firestore,
  callDocRef: DocumentReference,
  pc: RTCPeerConnection,
  offerDescription: RTCSessionDescriptionInit
) => {
  if (pc.signalingState !== 'stable') {
    return;
  }

  try {
    await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));
    flushPendingCandidates(pc as PeerConnectionWithUnsubscribe);

    if ((pc as RTCPeerConnection).signalingState !== 'have-remote-offer') {
      return;
    }

    const answerDescription = await pc.createAnswer();

    // Munge SDP to optimize Opus for CPU efficiency (ptime=40, cbr, FEC)
    answerDescription.sdp = mungeOpusSdp(answerDescription.sdp);

    await pc.setLocalDescription(answerDescription);

    const answer = {
      type: answerDescription.type,
      sdp: answerDescription.sdp,
    };

    await setDoc(callDocRef, { answer }, { merge: true });
  } catch {
    // ignore
  }
};
