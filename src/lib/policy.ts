/**
 * Assembling a policy from what the user typed in onboarding.
 *
 * The rule ordering here is the contract the whole app leans on: refs are
 * stable, sequential, and the same shape a verdict cites back. Kept in one
 * place so the onboarding preview and the stored policy can never disagree.
 */

import type { RuleKind } from "@prisma/client";
import { formatFils } from "./money";

export type DraftRule = { ref: string; text: string; kind: RuleKind; order: number };

export type DraftCategory = {
  name: string;
  slug: string;
  limitPerPeriodFils: number | null;
  discretionary: boolean;
};

export function ruleRef(index: number): string {
  return `R-${String(index + 1).padStart(2, "0")}`;
}

/**
 * Hard rules, then limits, then non-negotiables, then leaks. Limits are derived
 * from the category limits the user set, so a limit is citable by ref rather
 * than being invisible arithmetic the verdict cannot point at.
 */
export function assembleRules(input: {
  hardRules: readonly string[];
  categories: readonly DraftCategory[];
  nonNegotiables: readonly string[];
  leaks: readonly string[];
}): DraftRule[] {
  const lines: Array<{ text: string; kind: RuleKind }> = [];

  for (const text of input.hardRules) lines.push({ text, kind: "HARD_RULE" });

  for (const category of input.categories) {
    if (category.limitPerPeriodFils === null) continue;
    lines.push({
      text: `${category.name} stays under ${formatFils(category.limitPerPeriodFils, {
        decimals: "auto",
      })} a period`,
      kind: "LIMIT",
    });
  }

  for (const text of input.nonNegotiables) lines.push({ text, kind: "NONNEGOTIABLE" });
  for (const text of input.leaks) lines.push({ text, kind: "LEAK" });

  return lines.map((line, index) => ({
    ref: ruleRef(index),
    text: line.text,
    kind: line.kind,
    order: index + 1,
  }));
}

const KIND_HEADING: Record<RuleKind, string> = {
  HARD_RULE: "Hard rules",
  LIMIT: "Limits",
  NONNEGOTIABLE: "Non-negotiables",
  LEAK: "Leaks",
};

/** The plain-text policy stored on Policy.body and sent to the verdict engine. */
export function assemblePolicyBody(input: {
  displayName: string;
  monthlyIncomeFils: number;
  rules: readonly DraftRule[];
}): string {
  const sections: string[] = [
    `${input.displayName} earns ${formatFils(input.monthlyIncomeFils, {
      decimals: "auto",
    })} a period and wrote this policy to decide what happens to it.`,
  ];

  for (const kind of ["HARD_RULE", "LIMIT", "NONNEGOTIABLE", "LEAK"] as const) {
    const matching = input.rules.filter((rule) => rule.kind === kind);
    if (matching.length === 0) continue;
    sections.push(
      `${KIND_HEADING[kind]}\n${matching.map((rule) => `${rule.ref}  ${rule.text}`).join("\n")}`,
    );
  }

  return sections.join("\n\n");
}

export const RULE_KIND_LABEL = KIND_HEADING;

/** Split a textarea into one rule per non-empty line. */
export function linesToRules(input: string): string[] {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 40);
}
