'use client';

import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

function getFunctionsInstance() {
  const app = getApp();
  return getFunctions(app);
}

export async function callCreateInvite(
  sessionId: string,
  maxUses: number = 1
): Promise<{ ok: boolean; token?: string; inviteId?: string }> {
  const functions = getFunctionsInstance();
  const createInvite = httpsCallable<
    { sessionId: string; maxUses: number },
    { ok: boolean; token?: string; inviteId?: string }
  >(functions, 'createInvite');
  const result = await createInvite({ sessionId, maxUses });
  return result.data;
}

export async function callRedeemInvite(
  sessionId: string,
  token: string
): Promise<{ ok: boolean; reason?: string }> {
  const functions = getFunctionsInstance();
  const redeemInvite = httpsCallable<
    { sessionId: string; token: string },
    { ok: boolean; reason?: string }
  >(functions, 'redeemInvite');
  const result = await redeemInvite({ sessionId, token });
  return result.data;
}

export async function callRevokeInvite(
  sessionId: string,
  inviteId: string
): Promise<{ ok: boolean }> {
  const functions = getFunctionsInstance();
  const revokeInvite = httpsCallable<
    { sessionId: string; inviteId: string },
    { ok: boolean }
  >(functions, 'revokeInvite');
  const result = await revokeInvite({ sessionId, inviteId });
  return result.data;
}
