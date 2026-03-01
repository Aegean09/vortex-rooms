import { useEffect, useRef } from 'react';
import { type User, type SubSession } from '@/interfaces/session';
import { playJoinSound, playLeaveSound, playChannelSwitchSound } from '@/helpers/audio-helpers';

interface UseJoinSoundParams {
  users: User[] | null | undefined;
  subSessionsData: SubSession[] | null | undefined;
  currentUser: User | null;
}

export const useJoinSound = ({
  users,
  subSessionsData,
  currentUser,
}: UseJoinSoundParams) => {
  const userCountBySubSessionRef = useRef<Record<string, number>>({});
  const prevSubSessionIdRef = useRef<string | null>(null);
  const isInitializedRef = useRef(false);

  // Play sound when user switches channels
  useEffect(() => {
    if (!currentUser?.subSessionId) return;
    
    const prevSubSessionId = prevSubSessionIdRef.current;
    const currentSubSessionId = currentUser.subSessionId;
    
    // Only play sound if we had a previous channel (not first join)
    if (prevSubSessionId && prevSubSessionId !== currentSubSessionId && isInitializedRef.current) {
      playChannelSwitchSound();
    }
    
    prevSubSessionIdRef.current = currentSubSessionId;
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
    }
  }, [currentUser?.subSessionId]);

  // Play sound when someone joins or leaves the current channel
  useEffect(() => {
    if (users && subSessionsData) {
      const newCounts: Record<string, number> = {};

      subSessionsData.forEach(sub => {
        newCounts[sub.id] = 0;
      });

      users.forEach(user => {
        if (user.subSessionId && newCounts.hasOwnProperty(user.subSessionId)) {
          newCounts[user.subSessionId]++;
        }
      });

      if (currentUser?.subSessionId) {
        const subId = currentUser.subSessionId;
        const oldUserCount = userCountBySubSessionRef.current[subId] || 0;
        const newUserCount = newCounts[subId] || 0;

        // Someone joined our channel
        if (newUserCount > oldUserCount && oldUserCount > 0) {
          playJoinSound();
        }
        // Someone left our channel
        else if (newUserCount < oldUserCount && oldUserCount > 0) {
          playLeaveSound();
        }
      }

      userCountBySubSessionRef.current = newCounts;
    }
  }, [users, subSessionsData, currentUser?.subSessionId]);
};
