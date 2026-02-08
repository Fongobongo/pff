import { NextResponse } from "next/server";
import { z } from "zod";
import { buildNflTeamEconomicsSnapshot } from "@/lib/nfl/teamEconomics";

const querySchema = z.object({
  sort: z.enum(["team", "squad_value", "avg_price", "tradeable_players"]).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
});

function sortRows(
  rows: Awaited<ReturnType<typeof buildNflTeamEconomicsSnapshot>>["rows"],
  sort: NonNullable<z.infer<typeof querySchema>["sort"]>,
  dir: "asc" | "desc"
) {
  const multiplier = dir === "asc" ? 1 : -1;

  return rows.slice().sort((a, b) => {
    switch (sort) {
      case "team":
        return a.teamAbbr.localeCompare(b.teamAbbr) * multiplier;
      case "avg_price": {
        const cmp = a.avgPlayerPriceUsd - b.avgPlayerPriceUsd;
        if (cmp !== 0) return cmp * multiplier;
        return a.teamAbbr.localeCompare(b.teamAbbr);
      }
      case "tradeable_players": {
        const cmp = a.tradeablePlayers - b.tradeablePlayers;
        if (cmp !== 0) return cmp * multiplier;
        return a.teamAbbr.localeCompare(b.teamAbbr);
      }
      case "squad_value":
      default: {
        const cmp = a.squadValueUsd - b.squadValueUsd;
        if (cmp !== 0) return cmp * multiplier;
        return a.teamAbbr.localeCompare(b.teamAbbr);
      }
    }
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = querySchema.parse({
    sort: url.searchParams.get("sort") ?? undefined,
    dir: url.searchParams.get("dir") ?? undefined,
  });

  const sort = query.sort ?? "squad_value";
  const dir = query.dir ?? "desc";

  const snapshot = await buildNflTeamEconomicsSnapshot();

  return NextResponse.json(
    {
      ...snapshot,
      sort,
      dir,
      rows: sortRows(snapshot.rows, sort, dir),
    },
    {
      headers: {
        "cache-control": "s-maxage=120, stale-while-revalidate=600",
      },
    }
  );
}
