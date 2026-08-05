import type { ReactNode } from "react";

type Size = "xl" | "l" | "m";

const SIZE: Record<Size, string> = {
  xl: "t-display-xl",
  l: "t-display-l",
  m: "t-display-m",
};

export type OutlineHeadingProps = {
  /** Words rendered filled. Money that moved. */
  solid: readonly string[];
  /** Words rendered as a 1px stroke. Money that did not. */
  outline: readonly string[];
  as?: "h1" | "h2" | "h3" | "div";
  size?: Size;
  /** Put the outlined words on their own line beneath the solid ones. */
  stacked?: boolean;
  className?: string;
  id?: string;
};

/**
 * The typographic signature (§9.3): at least one word of every major headline is
 * an outline sitting beside solid words on the same line.
 *
 * The stroke is not decoration. Solid is money that moved, hollow is money that
 * did not — the same device the hero uses for the Kept numeral. Anything that
 * would make hollow stop reading as hollow (a filled accent, a shadow, a
 * radius) is banned everywhere else in the system to protect it.
 */
export function OutlineHeading({
  solid,
  outline,
  as: Tag = "h2",
  size = "l",
  stacked = false,
  className = "",
  id,
}: OutlineHeadingProps) {
  const solidText = solid.join(" ");
  const outlineText = outline.join(" ");

  return (
    <Tag id={id} className={`${SIZE[size]} ${className}`}>
      {solidText ? <span>{solidText}</span> : null}
      {solidText && outlineText ? (
        stacked ? (
          <br />
        ) : (
          " "
        )
      ) : null}
      {outlineText ? <span className="t-outline">{outlineText}</span> : null}
    </Tag>
  );
}

/** A label above a heading. Monospace, muted, uppercase. */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`t-label text-[var(--color-muted)] ${className}`}>{children}</p>;
}
