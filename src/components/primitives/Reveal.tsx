"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

export type RevealProps = {
  children: ReactNode;
  /**
   * For anything already on screen at load. Reveals on requestAnimationFrame
   * and is never observed.
   *
   * An IntersectionObserver with a negative root margin never intersects on a
   * short viewport, and the element then stays invisible forever. Anything
   * above the fold uses this instead.
   */
  immediate?: boolean;
  /** Stagger between siblings; §12.4 specifies 90ms. */
  delay?: number;
  as?: ElementType;
  className?: string;
  id?: string;
};

/**
 * §12.4. From { opacity: 0, y: 26, filter: blur(9px) } to rest over 800ms.
 * The blur is what makes it read as focus pulling in rather than a fade.
 *
 * The start state lives on `.reveal-init`, which only bites under `.js-reveal`
 * — a class added by an inline script in the document head, and only after it
 * has confirmed reduced motion is not requested. So the reduced-motion render
 * and the no-JS render are both the finished app, not a blank page.
 */
export function Reveal({
  children,
  immediate = false,
  delay = 0,
  as: Tag = "div",
  className = "",
  id,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (shown) return;
    const element = ref.current;
    if (!element) return;

    // If the start state was never applied there is nothing to reveal.
    if (!document.documentElement.classList.contains("js-reveal")) {
      setShown(true);
      return;
    }

    if (immediate) {
      const frame = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setShown(true); // Fires once. Entry reveals never un-reveal.
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.01 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [immediate, shown]);

  return (
    <Tag
      id={id}
      ref={ref}
      className={`reveal-init ${shown ? "reveal-in" : ""} ${className}`}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}

/** Reveal a list of blocks with the specified 90ms stagger. */
export function RevealGroup({
  children,
  immediate = false,
  step = 90,
  className = "",
}: {
  children: ReactNode[];
  immediate?: boolean;
  step?: number;
  className?: string;
}) {
  return (
    <>
      {children.map((child, index) => (
        <Reveal
          key={index}
          immediate={immediate}
          delay={index * step}
          className={className}
        >
          {child}
        </Reveal>
      ))}
    </>
  );
}
