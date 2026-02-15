import { createAvatar } from '@dicebear/core';
import { thumbs } from '@dicebear/collection';

export const AVATAR_STYLE = 'thumbs';

export const generateAvatarSvg = (seed: string): string => {
  const avatar = createAvatar(thumbs, { seed });
  return avatar.toDataUri();
};

export const generateRandomSeed = (): string => {
  return Math.random().toString(36).substring(2, 10);
};

export const AVATAR_PREVIEW_COUNT = 12;

export const generateAvatarPreviews = (count: number = AVATAR_PREVIEW_COUNT): string[] => {
  const seeds: string[] = [];
  for (let i = 0; i < count; i++) {
    seeds.push(generateRandomSeed());
  }
  return seeds;
};
