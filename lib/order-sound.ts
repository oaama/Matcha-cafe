// Tiny generated two-tone chime for new orders. No audio assets; WebAudio only.
// Browsers block audio before the first user gesture, so the context is
// created/resumed on the first pointerdown (unlockOrderSound) and play is a
// no-op until audio is actually allowed.

let audioContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) audioContext = new Ctor();
  return audioContext;
}

export function unlockOrderSound() {
  const context = getContext();
  if (context && context.state === 'suspended') void context.resume();
}

export function playOrderSound() {
  const context = getContext();
  if (!context || context.state !== 'running') return;
  const start = context.currentTime;
  [880, 1174.66].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const at = start + index * 0.18;
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.25, at + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.55);
  });
}
