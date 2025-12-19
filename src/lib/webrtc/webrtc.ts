
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

// Extend RTCPeerConnection to hold its own unsubscribe function
interface PeerConnectionWithUnsubscribe extends RTCPeerConnection {
  unsubscribeCandidates?: Unsubscribe;
}

export const createPeerConnection = (
  firestore: Firestore,
  sessionId: string,
  localPeerId: string,
  remotePeerId: string,
  onTrack: (stream: MediaStream, trackType: 'audio' | 'video') => void,
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
  // This listener will be unsubscribed in the cleanupConnection function in the provider
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
    console.log(`Received ${trackType} track from ${remotePeerId}`);
    event.streams.forEach(stream => {
      onTrack(stream, trackType);
    });
  };

  pc.onconnectionstatechange = () => {
    console.log(`Peer ${remotePeerId} connection state: ${pc.connectionState}`);
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed' || pc.connectionState === 'failed') {
      console.log(`Peer connection with ${remotePeerId} state: ${pc.connectionState}. Cleaning up.`);
      onDisconnect();
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
  
  // Listen for the answer
  const unsubscribeAnswer = onSnapshot(callDocRef, snapshot => {
    const data = snapshot.data();
    // Only set remote description if it's not already set and an answer exists
    if (pc.signalingState !== 'closed' && !pc.currentRemoteDescription && data?.answer) {
      console.log(`Got answer from ${remotePeerId}`);
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription).catch(e => console.error("Failed to set remote description: ", e));
    }
  });
  
  // Cleanup listener when connection closes
  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
        unsubscribeAnswer();
    }
  });

  // Create and set offer
  const offerDescription = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true, // Important for receiving screen share
  });
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  // Update the call document with the new offer
  await setDoc(callDocRef, { offer, callerId: localPeerId, calleeId: remotePeerId }, { merge: true });
  console.log(`Created offer for ${remotePeerId}`);
};


export const handleOffer = async (
  firestore: Firestore,
  callDocRef: DocumentReference,
  pc: RTCPeerConnection,
  offerDescription: RTCSessionDescriptionInit
) => {
    if (pc.signalingState !== 'stable') {
        console.warn(`Signaling state is ${pc.signalingState}, not stable. Will not handle offer now.`);
        return;
    }

    try {
        await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));
        console.log("Set remote description from offer");

        const answerDescription = await pc.createAnswer();
        await pc.setLocalDescription(answerDescription);
        console.log("Created answer");

        const answer = {
            type: answerDescription.type,
            sdp: answerDescription.sdp,
        };

        await setDoc(callDocRef, { answer }, { merge: true });
        console.log("Sent answer");
    } catch (error) {
        console.error("Error handling offer:", error);
    }
};
