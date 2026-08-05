"use client";

import { useEffect, useRef } from "react";

/**
 * The progress spine (§10). 2px, fixed to the top of the viewport, width bound
 * to scroll position — so it runs backwards on scroll up.
 *
 * It is never a loading indicator. /ask has its own pending line for that.
 */
export function Spine() {
  const fillRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fill = fillRef.current;
    if (!fill) return;

    let frame = 0;

    const paint = (): void => {
      frame = 0;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollable > 0 ? window.scrollY / scrollable : 0;
      fill.style.transform = `scaleX(${Math.min(Math.max(progress, 0), 1)})`;
    };

    const onScroll = (): void => {
      if (frame) return;
      frame = requestAnimationFrame(paint);
    };

    paint();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-x-0 top-0 z-[90] hidden h-[var(--frame-spine)] bg-[var(--color-hairline)] md:block"
    >
      <div
        ref={fillRef}
        className="h-full w-full origin-left bg-[var(--color-accent)]"
        style={{ transform: "scaleX(0)" }}
      />
    </div>
  );
}
