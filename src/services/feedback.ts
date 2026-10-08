import type { Settings } from '../core/models';
let audio: AudioContext | undefined;
export function unlockAudio() {
  try {
    audio ??= new AudioContext();
    void audio.resume().catch(() => {});
  } catch {
    /* Optional API. */
  }
}
export function feedback(kind: string, settings: Settings) {
  const error = kind === 'error',
    address = kind === 'address' || kind === 'galao' || kind === 'waiting';
  // A logo reage a cada leitura (ver BrandLogo).
  window.dispatchEvent(new CustomEvent('scanlog:feedback', { detail: kind }));
  if (settings.vibration)
    navigator.vibrate?.(error ? [60, 50, 60] : address ? [25, 35, 25] : 25);
  if (!settings.sound || !audio || audio.state !== 'running') return;
  const oscillator = audio.createOscillator(),
    gain = audio.createGain();
  oscillator.frequency.value = error ? 220 : address ? 620 : 1050;
  gain.gain.setValueAtTime(0.1, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.13);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + 0.14);
}
