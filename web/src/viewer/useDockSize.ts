import { useState } from "react";

const MIN = 120;
const MAX = 900;

export function useDockSize(key: string, initial: number) {
  const [size, setSize] = useState(() => {
    const raw = localStorage.getItem(`dock:${key}`);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : initial;
  });
  const resize = (delta: number) =>
    setSize((s) => {
      const next = Math.min(MAX, Math.max(MIN, s + delta));
      localStorage.setItem(`dock:${key}`, String(next));
      return next;
    });
  return [size, resize] as const;
}
