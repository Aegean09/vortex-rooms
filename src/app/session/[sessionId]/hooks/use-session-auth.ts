import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth, useUser } from '@/firebase';
import { initiateAnonymousSignIn } from '@/firebase/non-blocking-login';

export const useSessionAuth = () => {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  const auth = useAuth();
  const { user: authUser, isUserLoading } = useUser();
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const storedUsername = sessionStorage.getItem(
      `vortex-username-${sessionId}`
    );
    const setupComplete = sessionStorage.getItem(
      `vortex-setup-complete-${sessionId}`
    );

    if (setupComplete !== 'true' || !storedUsername) {
      router.replace(`/session/${sessionId}/setup`);
    } else {
      setUsername(storedUsername);
    }
  }, [sessionId, router]);

  useEffect(() => {
    if (!isUserLoading && !authUser && auth) {
      initiateAnonymousSignIn(auth);
    }
  }, [authUser, isUserLoading, auth]);

  return {
    sessionId,
    auth,
    authUser,
    isUserLoading,
    username,
  };
};
