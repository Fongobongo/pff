"use client";

import { useMemo, useState } from "react";

type Tier = "A" | "B" | "C";

type TierMap = Record<string, Tier>;

const TIERS: Tier[] = ["A", "B", "C"];

export default function FootballTierEditor({
  base,
  overrides,
}: {
  base: TierMap;
  overrides: Partial<TierMap>;
}) {
  const [localOverrides, setLocalOverrides] = useState<Partial<TierMap>>(overrides ?? {});

  const codes = useMemo(
    () => Array.from(new Set([...Object.keys(base), ...Object.keys(localOverrides)])).sort(),
    [base, localOverrides]
  );

  const jsonOutput = useMemo(() => JSON.stringify(localOverrides, null, 2), [localOverrides]);

  function updateOverride(code: string, value: string) {
    const normalized = code.toUpperCase();
    if (value === "") {
      const next = { ...localOverrides };
      delete next[normalized];
      setLocalOverrides(next);
      return;
    }
    if (!TIERS.includes(value as Tier)) return;
    setLocalOverrides({ ...localOverrides, [normalized]: value as Tier });
  }

  function handleAdd(code: string, tier: Tier) {
    if (!code) return;
    const normalized = code.toUpperCase();
    setLocalOverrides({ ...localOverrides, [normalized]: tier });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5">
        <div className="text-sm font-semibold text-black dark:text-white">Overrides</div>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Changes here only generate JSON. To apply in production, set
          <code className="mx-1 rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-white/10">
            FOOTBALL_TIER_OVERRIDES
          </code>
          and redeploy.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
            placeholder="Code (PL, CL, PD...)"
            id="tier-code-input"
          />
          <select
            className="rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
            id="tier-select-input"
            defaultValue="A"
          >
            {TIERS.map((tier) => (
              <option key={tier} value={tier}>
                Tier {tier}
              </option>
            ))}
          </select>
          <button
            className="rounded-md border border-black/10 bg-black px-3 py-2 text-sm text-white hover:bg-black/80 dark:border-white/10 dark:bg-white dark:text-black dark:hover:bg-white/80"
            onClick={() => {
              const codeInput = document.getElementById("tier-code-input") as HTMLInputElement | null;
              const tierInput = document.getElementById("tier-select-input") as HTMLSelectElement | null;
              if (!codeInput || !tierInput) return;
              handleAdd(codeInput.value.trim(), tierInput.value as Tier);
              codeInput.value = "";
            }}
          >
            Add override
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-white/5">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Base tier</th>
              <th className="px-3 py-2">Override</th>
              <th className="px-3 py-2">Resolved</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((code) => (
              <tr key={code} className="border-t border-black/10 dark:border-white/10">
                <td className="px-3 py-2 text-black dark:text-white">{code}</td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{base[code] ?? "-"}</td>
                <td className="px-3 py-2">
                  <select
                    className="w-full rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
                    value={localOverrides[code] ?? ""}
                    onChange={(e) => updateOverride(code, e.target.value)}
                  >
                    <option value="">inherit</option>
                    {TIERS.map((tier) => (
                      <option key={tier} value={tier}>
                        {tier}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                  {localOverrides[code] ?? base[code] ?? "?"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          FOOTBALL_TIER_OVERRIDES
        </div>
        <textarea
          className="mt-2 h-40 w-full rounded-xl border border-black/10 bg-white p-3 text-xs text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
          readOnly
          value={jsonOutput}
        />
      </div>
    </div>
  );
}
