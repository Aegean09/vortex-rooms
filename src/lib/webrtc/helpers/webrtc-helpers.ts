import { Firestore, collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { PeerConnectionWithUnsubscribe } from '../types';

export const cleanupFirestoreCall = async (
  firestore: Firestore,
  sessionId: string,
  localPeerId: string,
  peerId: string
): Promise<void> => {
  const callId = localPeerId < peerId ? `${localPeerId}_${peerId}` : `${peerId}_${localPeerId}`;
  const callDocRef = doc(firestore, 'sessions', sessionId, 'calls', callId);
  
  try {
    const batch = writeBatch(firestore);
    
    const offerCandidatesSnapshot = await getDocs(collection(callDocRef, 'offerCandidates'));
    offerCandidatesSnapshot.forEach(doc => batch.delete(doc.ref));

    const answerCandidatesSnapshot = await getDocs(collection(callDocRef, 'answerCandidates'));
    answerCandidatesSnapshot.forEach(doc => batch.delete(doc.ref));
    
    batch.delete(callDocRef);
    await batch.commit();
  } catch {
    // ignore (e.g. NOT_FOUND)
  }
};

export const cleanupPeerConnection = (
  peerConnections: React.MutableRefObject<Record<string, PeerConnectionWithUnsubscribe>>,
  peerId: string
): void => {
  const pc = peerConnections.current[peerId];
  if (pc) {
    if (pc.unsubscribeCandidates) {
      pc.unsubscribeCandidates();
    }
    pc.close();
    delete peerConnections.current[peerId];
  }
};

export const addTrackToRemoteStream = (
  remoteStreams: Record<string, MediaStream>,
  peerId: string,
  track: MediaStreamTrack
): Record<string, MediaStream> => {
  const existingStream = remoteStreams[peerId];
  if (existingStream) {
    const hasTrack = existingStream.getTracks().some(t => t.id === track.id);
    if (!hasTrack) {
      existingStream.addTrack(track);
      return { ...remoteStreams };
    }
    return remoteStreams;
  } else {
    const newStream = new MediaStream([track]);
    return { ...remoteStreams, [peerId]: newStream };
  }
};
