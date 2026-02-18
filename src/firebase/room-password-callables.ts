'use client';

import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

export interface SetRoomPasswordResult {
  data: { ok: boolean };
}

export interface VerifyRoomPasswordResult {
  data: { ok: boolean };
}

function getFunctionsInstance() {
  const app = getApp();
  return getFunctions(app);
}

export async function callSetRoomPassword(sessionId: string, password: string): Promise<{ ok: boolean }> {
  const functions = getFunctionsInstance();
  const setRoomPassword = httpsCallable<{ sessionId: string; password: string }, { ok: boolean }>(
    functions,
    'setRoomPassword'
  );
  const result = await setRoomPassword({ sessionId, password });
  return result.data;
}

export async function callVerifyRoomPassword(sessionId: string, password: string): Promise<{ ok: boolean }> {
  const functions = getFunctionsInstance();
  const verifyRoomPassword = httpsCallable<{ sessionId: string; password: string }, { ok: boolean }>(
    functions,
    'verifyRoomPassword'
  );
  const result = await verifyRoomPassword({ sessionId, password });
  return result.data;
}
