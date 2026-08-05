"use client";

import { useCallback, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { DeckCard } from "./DeckCard";
import { formatFilsWhole } from "@/lib/money";
import type { DeckCard as Card } from "@/lib/demo";

const VISIBLE = 4;
const THROW_THRESHOLD = 0.1; // of deck width
const THROW_MS = 380;

type Thrown = { id: string; direction: -1 | 1 } | null;

/**
 * §12.1. Right approves, left holds. Holding adds the amount to the counter
 * beside the deck, which is the whole point of the gesture: you feel the money
 * accumulate as you decline things.
 *
 * Operable by pointer, by touch, and by keyboard alone. `touch-action: pan-y`
 * so a vertical scroll still works on a phone.
 */
export function SwipeDeck({ cards, currency }: { cards: Card[]; currency: string }) {
  const [index, setIndex] = useState(0);
  const [keptFils, setKeptFils] = useState(0);
  const [thrown, setThrown] = useState<Thrown>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number } | null>(null);
  const deckRef = useRef<HTMLDivElement | null>(null);
  const pointerStart = useRef<number | null>(null);
  const reduced = useReducedMotion();

  const remaining = cards.slice(index);
  const top = remaining[0];

  const resolve = useCallback(
    (direction: -1 | 1) => {
      const card = cards[index];
      if (!card) return;

      // Left is a hold: the money stays where it is.
      if (direction === -1) setKeptFils((total) => total + card.amountFils);

      setDrag(null);
      if (reduced) {
        setIndex((current) => Math.min(current + 1, cards.length));
        return;
      }

      setThrown({ id: card.id, direction });
      window.setTimeout(() => {
        setIndex((current) => Math.min(current + 1, cards.length));
        setThrown(null);
      }, THROW_MS);
    },
    [cards, index, reduced],
  );

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (!top) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    pointerStart.current = event.clientX;
    setDrag({ id: top.id, dx: 0 });
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    if (pointerStart.current === null || !top) return;
    setDrag({ id: top.id, dx: event.clientX - pointerStart.current });
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    if (pointerStart.current === null || !top) return;
    const dx = event.clientX - pointerStart.current;
    pointerStart.current = null;

    const width = deckRef.current?.offsetWidth ?? 320;
    if (Math.abs(dx) > width * THROW_THRESHOLD) {
      resolve(dx > 0 ? 1 : -1);
    } else {
      setDrag(null); // Spring home.
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (!top) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      resolve(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      resolve(-1);
    }
  }

  const done = index >= cards.length;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-9">
      <div className="flex w-full max-w-[420px] flex-col gap-4">
        <div
          ref={deckRef}
          tabIndex={0}
          role="group"
          aria-roledescription="card deck"
          aria-label="Example verdicts. Right arrow approves, left arrow holds."
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative h-[280px] w-full touch-pan-y select-none outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
          style={{ touchAction: "pan-y" }}
        >
          {done ? (
            <div className="absolute inset-0 flex flex-col justify-center gap-3 border border-[var(--color-hairline)] p-6">
              <p className="t-label text-[var(--color-muted)]">That is the deck</p>
              <p className="t-body text-[var(--color-ink-2)]">
                Every card was a real verdict from the demo dataset, with the rule that fired.
              </p>
              <button
                type="button"
                className="btn self-start"
                onClick={() => {
                  setIndex(0);
                  setKeptFils(0);
                }}
              >
                Deal again
              </button>
            </div>
          ) : (
            remaining
              .slice(0, VISIBLE)
              .map((card, depth) => (
                <DeckCard
                  key={card.id}
                  card={card}
                  depth={depth}
                  currency={currency}
                  dragX={drag?.id === card.id ? drag.dx : 0}
                  thrownDirection={thrown?.id === card.id ? thrown.direction : 0}
                  deckWidth={deckRef.current?.offsetWidth ?? 320}
                  reduced={Boolean(reduced)}
                />
              ))
              .reverse()
          )}
        </div>

        <p className="t-label text-[var(--color-muted)]">
          Drag right to approve, left to hold. Or use the arrow keys.
        </p>

        <div className="flex items-center gap-2" aria-hidden="true">
          {cards.map((card, dot) => (
            <span
              key={card.id}
              className={`size-[5px] ${
                dot === index
                  ? "bg-[var(--color-accent)]"
                  : dot < index
                    ? "bg-[var(--color-ink-2)]"
                    : "bg-[var(--color-hairline)]"
              }`}
            />
          ))}
        </div>

        <div className="flex gap-3 lg:hidden">
          <button type="button" className="btn" onClick={() => resolve(-1)} disabled={done}>
            Hold it
          </button>
          <button type="button" className="btn" onClick={() => resolve(1)} disabled={done}>
            Approve
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-[var(--color-hairline)] pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
        <span className="t-label text-[var(--color-muted)]">Kept in this deck</span>
        <output
          aria-live="polite"
          className="t-display-m tnum block text-[var(--color-ink)]"
        >
          {formatFilsWhole(keptFils, currency)}
        </output>
        <p className="t-body max-w-[32ch] text-[var(--color-ink-2)]">
          Every card you hold adds its amount here. That is the whole metric: money that stayed
          where it was.
        </p>
      </div>
    </div>
  );
}
