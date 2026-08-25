'use client';

import { useEffect, useState } from 'react';

export function useCooldown(seconds = 60) {
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);

  return {
    left,
    locked: left > 0,
    trigger: () => setLeft(seconds),
  };
}
