import { useEffect } from "react";

export function useStartupViewportSync() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    // Tauri + macOS overlay windows can report stale viewport metrics on first paint.
    // Nudge layout recalculation so users don't need to move/drag the window manually.
    const triggerResize = () => {
      window.dispatchEvent(new Event("resize"));
    };

    let frameOne = 0;
    let frameTwo = 0;
    frameOne = window.requestAnimationFrame(() => {
      triggerResize();
      frameTwo = window.requestAnimationFrame(triggerResize);
    });

    const timeoutFast = window.setTimeout(triggerResize, 120);
    const timeoutSlow = window.setTimeout(triggerResize, 420);

    return () => {
      window.cancelAnimationFrame(frameOne);
      window.cancelAnimationFrame(frameTwo);
      window.clearTimeout(timeoutFast);
      window.clearTimeout(timeoutSlow);
    };
  }, []);
}
