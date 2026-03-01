/**
 * ICE Connection Monitor
 * Tracks connection type (P2P vs TURN relay) for debugging
 */

export type CandidateType = 'host' | 'srflx' | 'relay' | 'prflx' | 'unknown';

export interface IceConnectionInfo {
  localType: CandidateType;
  remoteType: CandidateType;
  isRelay: boolean;
  protocol: string;
  localAddress?: string;
  remoteAddress?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StatsReport = any;

export const getSelectedCandidatePair = async (
  pc: RTCPeerConnection
): Promise<IceConnectionInfo | null> => {
  try {
    const stats = await pc.getStats();
    const reports = new Map<string, StatsReport>();
    let selectedPairLocalId: string | null = null;
    let selectedPairRemoteId: string | null = null;

    stats.forEach((report: StatsReport) => {
      reports.set(report.id, report);
      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        if (!selectedPairLocalId || report.nominated) {
          selectedPairLocalId = report.localCandidateId;
          selectedPairRemoteId = report.remoteCandidateId;
        }
      }
    });

    if (!selectedPairLocalId || !selectedPairRemoteId) return null;

    const localCandidate = reports.get(selectedPairLocalId);
    const remoteCandidate = reports.get(selectedPairRemoteId);

    if (!localCandidate || !remoteCandidate) return null;

    const localType = (localCandidate.candidateType || 'unknown') as CandidateType;
    const remoteType = (remoteCandidate.candidateType || 'unknown') as CandidateType;

    return {
      localType,
      remoteType,
      isRelay: localType === 'relay' || remoteType === 'relay',
      protocol: localCandidate.protocol || 'unknown',
      localAddress: localCandidate.address,
      remoteAddress: remoteCandidate.address,
    };
  } catch {
    return null;
  }
};

export const logConnectionType = async (
  pc: RTCPeerConnection,
  peerId: string
): Promise<void> => {
  const info = await getSelectedCandidatePair(pc);
  
  if (!info) {
    console.log(`[ICE] ${peerId}: Connection info not available yet`);
    return;
  }

  const connectionType = info.isRelay ? 'TURN RELAY' : 'P2P';
  console.log(
    `[ICE] ${peerId}: ${connectionType} | local=${info.localType} remote=${info.remoteType} proto=${info.protocol}`
  );
};

export const monitorIceConnection = (
  pc: RTCPeerConnection,
  peerId: string,
  onRelayDetected?: () => void
): void => {
  pc.addEventListener('connectionstatechange', async () => {
    if (pc.connectionState === 'connected') {
      const info = await getSelectedCandidatePair(pc);
      if (info?.isRelay && onRelayDetected) {
        onRelayDetected();
      }
      await logConnectionType(pc, peerId);
    }
  });
};
