'use client';

import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

function getFunctionsInstance() {
  const app = getApp();
  return getFunctions(app);
}

export async function callDeleteSessionCompletely(sessionId: string): Promise<{ ok: boolean }> {
  const functions = getFunctionsInstance();
  const deleteSessionCompletely = httpsCallable<{ sessionId: string }, { ok: boolean }>(
    functions,
    'deleteSessionCompletely'
  );
  const result = await deleteSessionCompletely({ sessionId });
  return result.data;
}

export async function callLeaveSession(sessionId: string): Promise<{ ok: boolean }> {
  const functions = getFunctionsInstance();
  const leaveSession = httpsCallable<{ sessionId: string }, { ok: boolean }>(
    functions,
    'leaveSession'
  );
  const result = await leaveSession({ sessionId });
  return result.data;
}
