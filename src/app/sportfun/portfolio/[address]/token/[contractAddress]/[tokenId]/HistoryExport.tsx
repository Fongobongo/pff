"use client";

type TokenEvent = {
  kind: "buy" | "sell" | "promotion" | "transfer";
  hash: string;
  timestamp?: string;
  sharesDeltaRaw: string;
  usdcDeltaRaw?: string;
  priceUsdcPerShareRaw?: string;
  note?: string;
};

type Props = {
  events: TokenEvent[];
  filename: string;
};

function csvEscape(value: string) {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function buildCsv(events: TokenEvent[]) {
  const header = [
    "timestamp",
    "kind",
    "shares_delta_raw",
    "usdc_delta_raw",
    "price_usdc_per_share_raw",
    "tx_hash",
    "note",
  ];

  const rows = events.map((e) => [
    e.timestamp ?? "",
    e.kind,
    e.sharesDeltaRaw,
    e.usdcDeltaRaw ?? "",
    e.priceUsdcPerShareRaw ?? "",
    e.hash,
    e.note ?? "",
  ]);

  return [header, ...rows].map((row) => row.map((cell) => csvEscape(String(cell))).join(",")).join("\n");
}

export default function HistoryExport({ events, filename }: Props) {
  function handleExport() {
    if (!events.length) return;
    const csv = buildCsv(events);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <button
      className="rounded-md border border-white/10 bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/15"
      onClick={handleExport}
      disabled={!events.length}
    >
      Export CSV
    </button>
  );
}
