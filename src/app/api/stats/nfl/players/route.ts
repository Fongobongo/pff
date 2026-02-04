import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchNflPlayers } from "@/lib/stats/nflverse";

const querySchema = z.object({
  q: z.string().optional(),
  team: z.string().optional(),
  position: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  page_size: z.coerce.number().int().min(1).max(200).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = querySchema.parse({
    q: url.searchParams.get("q") ?? undefined,
    team: url.searchParams.get("team") ?? undefined,
    position: url.searchParams.get("position") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    page_size: url.searchParams.get("page_size") ?? undefined,
  });

  const page = query.page ?? 1;
  const pageSize = query.page_size ?? 100;

  const data = await fetchNflPlayers();
  const q = query.q?.trim().toLowerCase();
  const team = query.team?.trim().toUpperCase();
  const position = query.position?.trim().toUpperCase();
  const status = query.status?.trim().toUpperCase();

  const facets = {
    positions: Array.from(
      new Set(data.rows.map((row) => row.position).filter((value): value is string => Boolean(value)))
    ).sort(),
    statuses: Array.from(
      new Set(data.rows.map((row) => row.status).filter((value): value is string => Boolean(value)))
    ).sort(),
  };

  let filtered = data.rows;

  if (q) {
    filtered = filtered.filter((row) => {
      const haystack = [
        row.displayName,
        row.firstName,
        row.lastName,
        row.playerId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  if (team) {
    filtered = filtered.filter((row) => (row.latestTeam ?? "").toUpperCase() === team);
  }

  if (position) {
    filtered = filtered.filter((row) => (row.position ?? "").toUpperCase() === position);
  }

  if (status) {
    filtered = filtered.filter((row) => (row.status ?? "").toUpperCase() === status);
  }

  filtered = filtered.slice().sort((a, b) => {
    const seasonDelta = (b.lastSeason ?? 0) - (a.lastSeason ?? 0);
    if (seasonDelta !== 0) return seasonDelta;
    return a.displayName.localeCompare(b.displayName);
  });

  const total = filtered.length;
  const offset = (page - 1) * pageSize;
  const rows = filtered.slice(offset, offset + pageSize);

  return NextResponse.json({
    sport: "nfl",
    source: "nflverse_data",
    sourceUrl: data.sourceUrl,
    page,
    pageSize,
    total,
    filters: {
      q: query.q ?? null,
      team: query.team ?? null,
      position: query.position ?? null,
      status: query.status ?? null,
    },
    facets,
    rows,
  });
}
