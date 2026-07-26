import { useEffect, useRef } from "react";

// Holds the screen wake lock while `active` is true. Locks are dropped
// automatically when the tab backgrounds, so we re-acquire on the
// visibilitychange back to visible if still active. Never lets a wake lock
// failure (unsupported browser, permission denial) affect the timer.
export function useWakeLock(active: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    let cancelled = false;

    const acquire = async () => {
      try {
        const sentinel = await navigator.wakeLock?.request("screen");
        if (cancelled) {
          sentinel?.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel ?? null;
      } catch {
        // unsupported or denied — no-op
      }
    };

    const release = async () => {
      try {
        await sentinelRef.current?.release();
      } catch {
        // ignore
      }
      sentinelRef.current = null;
    };

    if (active) {
      acquire();
    } else {
      release();
    }

    const onVisibility = () => {
      if (active && document.visibilityState === "visible" && !sentinelRef.current) {
        acquire();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      release();
    };
  }, [active]);
}
