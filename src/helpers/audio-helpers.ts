export const playJoinSound = () => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (!audioContext) return;

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
  gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.1);
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
