import { useState, useEffect, useRef } from 'react';
import { getUserMedia, stopMediaStream } from '../services/audio-service';
import { createAudioNodes, processNoiseGate, cleanupAudioNodes, type AudioNodes } from '../helpers/audio-helpers';

export interface UseAudioStreamReturn {
  rawStream: MediaStream | null;
  localStream: MediaStream | null;
  setNoiseGateThreshold: (threshold: number) => void;
  noiseGateThreshold: number;
}

const DEFAULT_THRESHOLD = 0.126;

export const useAudioStream = (userId: string | null): UseAudioStreamReturn => {
  const [rawStream, setRawStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [noiseGateThreshold, setNoiseGateThreshold] = useState<number>(DEFAULT_THRESHOLD);

  const audioNodesRef = useRef<AudioNodes | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!userId) return;

    const getMedia = async () => {
      try {
        const stream = await getUserMedia();
        setRawStream(stream);
      } catch (error) {
        console.error('Error accessing media devices.', error);
      }
    };

    getMedia();

    return () => {
      stopMediaStream(rawStream);
      setRawStream(null);
      setLocalStream(null);
    };
  }, [userId]);

  useEffect(() => {
    if (!rawStream || rawStream.getAudioTracks().length === 0) {
      setLocalStream(null);
      return;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioNodesRef.current) {
      cleanupAudioNodes(audioNodesRef.current, animationFrameRef.current);
    }

    const nodes = createAudioNodes(rawStream, {
      threshold: noiseGateThreshold,
    });
    audioNodesRef.current = nodes;

    const processedStream = nodes.destination.stream;
    setLocalStream(processedStream);

    const processFrame = () => {
      if (nodes.analyser && nodes.gainNode) {
        animationFrameRef.current = processNoiseGate(
          nodes.analyser,
          nodes.gainNode,
          noiseGateThreshold,
          processFrame
        );
      }
    };
    processFrame();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      cleanupAudioNodes(nodes, animationFrameRef.current);
    };
  }, [rawStream, noiseGateThreshold]);

  return {
    rawStream,
    localStream,
    noiseGateThreshold,
    setNoiseGateThreshold,
  };
};
