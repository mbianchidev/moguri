import { useEffect } from "react";

// Automatic saves and loads still in flight. Closing waits for them like drafts (D51) instead of treating them as unsaved edits (#100).
let count = 0, lastSettled = Number.NEGATIVE_INFINITY;
const settled = new Set<() => void>();

export const pendingWork = () => count > 0;
// A parent's unsaved flag learns that its child's request finished one render later, so a close just after it settles once more first.
export const pendingWorkJustSettled = () => count === 0 && performance.now() - lastSettled < 1000;

export function usePendingWork(active: boolean) {
  useEffect(() => {
    if (!active) return;
    count++;
    return () => {
      count--;
      if (count > 0) return;
      lastSettled = performance.now();
      for (const resolve of [...settled]) resolve();
    };
  }, [active]);
}

export function pendingWorkSettled(): Promise<void> {
  if (count === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { settled.delete(done); resolve(); };
    settled.add(done);
  });
}
