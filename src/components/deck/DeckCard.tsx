"use client";

import { formatFils } from "@/lib/money";
import type { DeckCard as Card } from "@/lib/demo";

/**
 * A card in the stack. Card `i` offsets by x: i*6, y: i*10, scale: 1 - i*0.03,
 * rotate: (i%2 ? 1 : -1) * i * 0.6deg — §12.1.
 *
 * The card is a ledger row's worth of information with the verdict word set in
 * the same solid/outline pair /ask uses, so the demo shows the real thing.
 */
export function DeckCard({
  card,
  depth,
  currency,
  dragX,
  thrownDirection,
  deckWidth,
  reduced,
}: {
  card: Card;
  depth: number;
  currency: string;
  dragX: number;
  thrownDirection: -1 | 1 | 0;
  deckWidth: number;
  reduced: boolean;
}) {
  const isTop = depth === 0;
  const dragging = isTop && dragX !== 0;

  const resting = {
    x: depth * 6,
    y: depth * 10,
    scale: 1 - depth * 0.03,
    rotate: (depth % 2 ? 1 : -1) * depth * 0.6,
  };

  const transform = thrownDirection
    ? `translate(${thrownDirection * deckWidth * 1.2}px, -40px) rotate(${thrownDirection * 22}deg)`
    : dragging
      ? `translate(${dragX}px, 0) rotate(${dragX / 18}deg) scale(1.02)`
      : `translate(${resting.x}px, ${resting.y}px) rotate(${resting.rotate}deg) scale(${resting.scale})`;

  const words =
    card.decision === "ALLOW"
      ? { solid: "GO", outline: "AHEAD" }
      : card.decision === "HOLD"
        ? { solid: "HOLD", outline: "FOR NOW" }
        : { solid: "NOT", outline: "THIS PERIOD" };

  return (
    <article
      aria-hidden={!isTop}
      className={`absolute inset-0 flex flex-col justify-between border bg-[var(--color-ground)] p-5 ${
        card.decision === "ALLOW"
          ? "border-[var(--color-hairline)]"
          : "border-[var(--color-hairline)] border-l-[var(--color-accent)]"
      }`}
      style={{
        transform,
        zIndex: 10 - depth,
        // No transition while dragging, so the card tracks the finger exactly.
        transition:
          reduced || dragging
            ? "none"
            : thrownDirection
              ? "transform 380ms cubic-bezier(.22,1,.36,1), opacity 380ms linear"
              : "transform 260ms cubic-bezier(.22,1,.36,1)",
        opacity: thrownDirection ? 0 : 1,
        cursor: isTop ? "grab" : "default",
      }}
    >
      <div className="flex items-baseline justify-between gap-4">
        <span className="t-label text-[var(--color-accent)]">
          {card.ruleRef ? `[ ${card.ruleRef} ]` : "NO RULE"}
        </span>
        <span className="t-value tnum">{formatFils(card.amountFils, { currency })}</span>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="t-display-m">
          <span>{words.solid}</span> <span className="t-outline">{words.outline}</span>
        </h3>
        {card.ruleText ? (
          <p className="t-body text-[var(--color-ink)]">&ldquo;{card.ruleText}&rdquo;</p>
        ) : null}
      </div>

      <div className="flex items-baseline justify-between gap-4 border-t border-[var(--color-hairline)] pt-3">
        <span className="t-label text-[var(--color-muted)]">{card.category}</span>
        <span className="t-label text-[var(--color-muted)]">{card.merchant}</span>
      </div>
    </article>
  );
}
