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
          pc.addIceCandidate(candidate).catch(e => console.error("Error adding received ICE candidate", e));
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
          } catch (e) {
            console.error(`Error restarting ICE for ${callId}:`, e);
          }
        }
      }, 2000);
    }
  };

  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
      setTimeout(() => {
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
          try {
            pc.restartIce();
          } catch (e) {
            console.error(`Error restarting ICE for ${callId}:`, e);
          }
        }
      }, 2000);
    }
  };

  return pc;
};

const flushPendingCandidates = (pc: PeerConnectionWithUnsubscribe) => {
  if (pc.pendingCandidates?.length) {
    for (const candidate of pc.pendingCandidates) {
      pc.addIceCandidate(candidate).catch(e => console.error("Error adding buffered ICE candidate", e));
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
        .catch(e => console.error("Failed to set remote description: ", e));
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
    await pc.setLocalDescription(answerDescription);

    const answer = {
      type: answerDescription.type,
      sdp: answerDescription.sdp,
    };

    await setDoc(callDocRef, { answer }, { merge: true });
  } catch (error) {
    console.error("Error handling offer:", error);
  }
};
