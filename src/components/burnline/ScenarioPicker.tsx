"use client";

import type { Scenario, ScenarioSet } from "@/lib/demo";

/**
 * Three square buttons carrying `aria-pressed`. The picker only ever reports
 * which scenario is current — it does not compute anything, so it cannot
 * disagree with what the chart beside it draws.
 */
export function ScenarioPicker({
  scenarios,
  current,
  onChange,
}: {
  scenarios: ScenarioSet;
  current: Scenario["id"];
  onChange: (id: Scenario["id"]) => void;
}) {
  const ids: Scenario["id"][] = ["tight", "normal", "payday"];

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Scenario">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          className="btn"
          aria-pressed={current === id}
          onClick={() => onChange(id)}
        >
          {scenarios[id].label}
        </button>
      ))}
    </div>
  );
}
