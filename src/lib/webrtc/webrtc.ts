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
          pc.addIceCandidate(candidate).catch(e => console.error("Error adding received ICE candidate", e));
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

export const createOffer = async (
  firestore: Firestore,
  sessionId: string,
  localPeerId: string,
  remotePeerId: string,
  pc: RTCPeerConnection
) => {
  const callId = localPeerId < remotePeerId ? `${localPeerId}_${remotePeerId}` : `${remotePeerId}_${localPeerId}`;
  const callDocRef = doc(firestore, 'sessions', sessionId, 'calls', callId);

  const unsubscribeAnswer = onSnapshot(callDocRef, snapshot => {
    const data = snapshot.data();
    if (pc.signalingState !== 'closed' && !pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription).catch(e => console.error("Failed to set remote description: ", e));
    }
  });

  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
      unsubscribeAnswer();
    }
  });

  const offerDescription = await pc.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: true,
  });
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await setDoc(callDocRef, { offer, callerId: localPeerId, calleeId: remotePeerId }, { merge: true });
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
