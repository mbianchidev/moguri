import { useEffect } from "react";

// Automatic saves and loads still in flight. Closing waits for them like drafts (D51) instead of treating them as unsaved edits (#100).
let count = 0;
const settled = new Set<() => void>();

export const pendingWork = () => count > 0;

export function usePendingWork(active: boolean) {
  useEffect(() => {
    if (!active) return;
    count++;
    return () => {
      count--;
      if (count === 0) for (const resolve of [...settled]) resolve();
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
