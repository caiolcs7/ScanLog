import { useEffect, useRef, useState } from 'react';

export function usePageVisible() {
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const change = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);
  return visible;
}
/** Tela acesa sem uso por 2 min volta a apagar; uma nova leitura reacende. */
const WAKE_IDLE_MS = 120_000;
export function useWakeLock(active: boolean, activity = 0) {
  const [locked, setLocked] = useState(false),
    [idle, setIdle] = useState(false);
  useEffect(() => {
    setIdle(false);
    if (!active) return;
    const timer = setTimeout(() => setIdle(true), WAKE_IDLE_MS);
    return () => clearTimeout(timer);
  }, [active, activity]);
  const hold = active && !idle;
  useEffect(() => {
    if (!hold || !('wakeLock' in navigator)) return;
    let cancelled = false;
    let lock: WakeLockSentinel | undefined;
    void navigator.wakeLock
      .request('screen')
      .then(async (value) => {
        if (cancelled) {
          await value.release();
          return;
        }
        lock = value;
        setLocked(true);
        value.addEventListener('release', () => setLocked(false));
      })
      .catch(() => setLocked(false));
    return () => {
      cancelled = true;
      void lock?.release().catch(() => {});
    };
  }, [hold]);
  return locked;
}
export function useHid(
  active: boolean,
  receive: (raw: string) => Promise<void>,
) {
  const receiver = useRef(receive);
  receiver.current = receive;
  useEffect(() => {
    if (!active) return;
    let buffer = '',
      last = 0;
    const key = (event: KeyboardEvent) => {
      if (
        document.querySelector('dialog[open]') ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.repeat
      )
        return;
      const element = event.target as HTMLElement;
      if (element.closest('input,textarea,select,[contenteditable="true"]'))
        return;
      if (event.key === 'Enter' || event.key === 'Tab') {
        if (buffer) {
          event.preventDefault();
          const raw = buffer;
          buffer = '';
          void receiver.current(raw);
        }
        return;
      }
      if (event.key.length === 1) {
        const now = Date.now();
        if (now - last > 160) buffer = '';
        buffer = (buffer + event.key).slice(0, 2048);
        last = now;
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [active]);
}
