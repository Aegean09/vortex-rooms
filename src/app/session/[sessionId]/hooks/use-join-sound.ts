import { useEffect, useRef } from 'react';
import { type User, type SubSession } from '@/interfaces/session';
import { playJoinSound } from '@/helpers/audio-helpers';

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

      let hasJoinedNewChannel = false;

      if (currentUser?.subSessionId) {
        const subId = currentUser.subSessionId;
        const oldUserCount = userCountBySubSessionRef.current[subId] || 0;
        const newUserCount = newCounts[subId] || 0;

        if (newUserCount > oldUserCount && oldUserCount > 0) {
          hasJoinedNewChannel = true;
        }
      }

      if (hasJoinedNewChannel) {
        playJoinSound();
      }

      userCountBySubSessionRef.current = newCounts;
    }
  }, [users, subSessionsData, currentUser?.subSessionId]);
};
