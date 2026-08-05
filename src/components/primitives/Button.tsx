import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * One variant only (§9.3): square, 1px hairline, transparent ground, ink text.
 * Hover swaps the border and the text to accent. The accent never fills.
 */

type BaseProps = {
  children: ReactNode;
  className?: string;
};

export function Button({
  children,
  className = "",
  type = "button",
  ...rest
}: BaseProps & ComponentProps<"button">) {
  return (
    <button type={type} className={`btn ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  children,
  href,
  className = "",
  ...rest
}: BaseProps & ComponentProps<typeof Link>) {
  return (
    <Link href={href} className={`btn ${className}`} {...rest}>
      {children}
    </Link>
  );
}

/**
 * A square toggle. `aria-pressed` carries the state, so the active style and the
 * accessible state can never disagree — which is the failure mode a `<select>`
 * would have hidden.
 */
export function Toggle({
  children,
  pressed,
  className = "",
  ...rest
}: BaseProps & { pressed: boolean } & ComponentProps<"button">) {
  return (
    <button type="button" aria-pressed={pressed} className={`btn ${className}`} {...rest}>
      {children}
    </button>
  );
}
