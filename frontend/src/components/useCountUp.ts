import { useEffect, useRef, useState } from 'react';

/**
 * Rolls a figure up to its value the way a ledger totals. Holds the last value between renders so a
 * poll that returns the same number does not restart the count, and hands the final value straight
 * over when the viewer has asked for reduced motion.
 */
export function useCountUp(target: number, ms = 750): number {
  const [value, setValue] = useState(target);
  const from = useRef(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || from.current === target) {
      from.current = target;
      setValue(target);
      return;
    }

    const origin = from.current;
    const started = performance.now();
    let frame = 0;

    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / ms);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(origin + (target - origin) * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      } else {
        from.current = target;
      }
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);

  return value;
}
