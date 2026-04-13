import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

const IDLE_MS = 30 * 60 * 1000; // 30 minutes
const EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

export function useIdleLogout() {
  const { user, signOut } = useAuth();
  const timerRef = useRef(null);

  useEffect(() => {
    if (!user) return;

    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        signOut('idle');
      }, IDLE_MS);
    };

    for (const e of EVENTS) window.addEventListener(e, reset, { passive: true });
    reset();

    return () => {
      for (const e of EVENTS) window.removeEventListener(e, reset);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [user, signOut]);
}
