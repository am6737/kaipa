// Rolls the numbers in a formatted string ("9.84", "12,300", "3.2万",
// "5 件  占总重 23%") from what is on screen to their new values. It works on the
// display text so the caller keeps owning units and formatting; when the text
// around the numbers changes ("--" → "9.84", 万 → plain) it just swaps.
import { useEffect, useRef, useState } from 'react';

const DURATION = 480;
const NUMBER = /-?\d+(?:,\d{3})*(?:\.\d+)?/g;
const SLOT = '\u0000';

type Num = { n: number; decimals: number; grouped: boolean };

const parse = (text: string) => {
  const nums: Num[] = [...text.matchAll(NUMBER)].map(([raw]) => {
    const dot = raw.indexOf('.');
    return { n: Number(raw.replace(/,/g, '')), decimals: dot < 0 ? 0 : raw.length - dot - 1, grouped: raw.includes(',') };
  });
  return { nums, frame: text.replace(NUMBER, SLOT) };
};

const render = (n: number, { decimals, grouped }: { decimals: number; grouped: boolean }) => {
  const [int, frac] = Math.abs(n).toFixed(decimals).split('.');
  const whole = grouped ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : int;
  return `${n < 0 ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
};

export function useRollingText(target: string): string {
  const [text, setText] = useState(target);
  // Last text actually shown, so an interrupted roll continues from where it is.
  const shown = useRef(target);

  useEffect(() => {
    const to = parse(target);
    const from = parse(shown.current);
    const rolls = to.nums.length > 0 && to.frame === from.frame && to.nums.length === from.nums.length && to.nums.some((num, i) => num.n !== from.nums[i].n);
    if (!rolls) {
      shown.current = target;
      setText(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      const eased = 1 - Math.pow(1 - t, 3);
      let i = 0;
      const next = t >= 1 ? target : to.frame.replace(/\u0000/g, () => {
        const a = from.nums[i];
        const b = to.nums[i++];
        return render(a.n + (b.n - a.n) * eased, { decimals: b.decimals, grouped: a.grouped || b.grouped });
      });
      shown.current = next;
      setText(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return text;
}
