import { useEffect, useMemo, useState } from 'react';
import { doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { Firestore } from 'firebase/firestore';
import { type SubSession } from '@/interfaces/session';

interface UseTextChannelManagerParams {
  firestore: Firestore | null;
  sessionId: string;
  textChannelsData: SubSession[] | null | undefined;
  isTextChannelsLoading: boolean;
}

export const useTextChannelManager = ({
  firestore,
  sessionId,
  textChannelsData,
  isTextChannelsLoading,
}: UseTextChannelManagerParams) => {
  useEffect(() => {
    if (textChannelsData && textChannelsData.length === 0 && !isTextChannelsLoading && firestore && sessionId) {
      const generalTextRef = doc(firestore, 'sessions', sessionId, 'textchannels', 'general');
      setDoc(generalTextRef, { id: 'general', name: 'General', createdAt: serverTimestamp() });
    }
  }, [textChannelsData, isTextChannelsLoading, firestore, sessionId]);

  const sortedTextChannels = useMemo(() => {
    if (!textChannelsData) return [];

    const general = textChannelsData.find(s => s.id === 'general');
    const others = textChannelsData.filter(s => s.id !== 'general');

    others.sort((a, b) => {
      const timeA = (a.createdAt as Timestamp)?.toMillis() || 0;
      const timeB = (b.createdAt as Timestamp)?.toMillis() || 0;
      return timeA - timeB;
    });

    return general ? [general, ...others] : others;
  }, [textChannelsData]);

  const [activeTextChannelId, setActiveTextChannelId] = useState<string>('general');

  useEffect(() => {
    if (sortedTextChannels.length > 0 && !sortedTextChannels.some(s => s.id === activeTextChannelId)) {
      setActiveTextChannelId('general');
    }
  }, [sortedTextChannels, activeTextChannelId]);

  const activeTextChannelName = sortedTextChannels.find(s => s.id === activeTextChannelId)?.name ?? 'General';

  return {
    sortedTextChannels,
    activeTextChannelId,
    setActiveTextChannelId,
    activeTextChannelName,
  };
};
