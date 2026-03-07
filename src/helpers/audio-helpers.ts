const createAudioContext = (): AudioContext | null => {
  try {
    return new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch {
    return null;
  }
};

// Two rising tones (C5 → E5)
export const playJoinSound = () => {
  const ctx = createAudioContext();
  if (!ctx) return;

  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.1, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
  osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
  osc.connect(gain);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.25);
  osc.onended = () => ctx.close();
};

// Two falling tones (E5 → C5)
export const playLeaveSound = () => {
  const ctx = createAudioContext();
  if (!ctx) return;

  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
  osc.frequency.setValueAtTime(523.25, ctx.currentTime + 0.1); // C5
  osc.connect(gain);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.25);
  osc.onended = () => ctx.close();
};

// Quick blip (G5)
export const playChannelSwitchSound = () => {
  const ctx = createAudioContext();
  if (!ctx) return;

  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(783.99, ctx.currentTime); // G5
  osc.connect(gain);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.15);
  osc.onended = () => ctx.close();
};

export const getKeyDisplayName = (keyCode: string): string => {
  if (keyCode === 'Space') return 'Space';
  if (keyCode === 'MediaRecord') return 'Record';
  if (keyCode.startsWith('Key')) return keyCode.replace('Key', '');
  if (keyCode.startsWith('Digit')) return keyCode.replace('Digit', '');
  if (keyCode.startsWith('Arrow')) return keyCode.replace('Arrow', 'Arrow ');
  return keyCode;
};

const MIN_DB = -60;
const MAX_DB = 0;

export const rmsToPercent = (rms: number): number => {
  if (rms <= 0.0001) return 0;
  const dB = 20 * Math.log10(rms);
  const percent = ((dB - MIN_DB) / (MAX_DB - MIN_DB)) * 100;
  return Math.max(0, Math.min(100, Math.round(percent)));
};

export const percentToRms = (percent: number): number => {
  const dB = MIN_DB + (percent / 100) * (MAX_DB - MIN_DB);
  return Math.pow(10, dB / 20);
};
