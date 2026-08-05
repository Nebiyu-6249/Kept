"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/ask", label: "Ask" },
  { href: "/holds", label: "Holds" },
  { href: "/ledger", label: "Ledger" },
  { href: "/import", label: "Import" },
  { href: "/review", label: "Review" },
  { href: "/insights", label: "Insights" },
] as const;

/**
 * The top bar (§10). 58px, translucent ground with a 12px blur and a bottom
 * hairline. The wordmark carries the period in accent; the active route carries
 * an accent underline.
 */
export function TopBar({ periodLabel }: { periodLabel: string }) {
  const pathname = usePathname();

  return (
    <header
      className="fixed inset-x-0 top-0 z-[85] h-[var(--frame-topbar)] border-b border-[var(--color-hairline)] md:left-[var(--frame-rail)]"
      style={{
        background: "color-mix(in srgb, var(--color-ground) 82%, transparent)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div className="flex h-full items-center justify-between gap-4 px-4 md:px-6">
        <Link href="/ask" className="flex items-baseline gap-3 no-underline">
          <span className="font-[family-name:var(--font-display)] text-[15px] font-700 tracking-[-.03em] text-[var(--color-ink)]">
            KEPT.
          </span>
          <span className="t-label tnum hidden text-[var(--color-accent)] sm:inline">
            {periodLabel}
          </span>
        </Link>

        <nav aria-label="Main" className="flex items-center gap-3 md:gap-5">
          <ul className="flex list-none items-center gap-3 overflow-x-auto md:gap-5">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`t-label border-b no-underline transition-colors ${
                      active
                        ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                        : "border-transparent text-[var(--color-ink-2)] hover:text-[var(--color-accent)]"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link href="/ask" className="btn hidden lg:inline-flex">
            Ask
          </Link>
        </nav>
      </div>
    </header>
  );
}
