import { parseCsv } from "@/lib/stats/csv";
import { withCache } from "@/lib/stats/cache";
import type { NflNormalizedStats } from "@/lib/stats/types";

const NFLVERSE_RELEASE_TAGS = ["player_stats", "stats_player"] as const;
const NFLVERSE_REPO = "https://api.github.com/repos/nflverse/nflverse-data";
const NFLVERSE_ASSET_PREFIX = "stats_player_week_";
const NFLVERSE_ASSET_SUFFIX = ".csv";

export type NflWeeklyRow = {
  player_id: string;
  player_name: string;
  player_display_name: string;
  position: string;
  position_group: string;
  team: string;
  opponent_team: string;
  season: number;
  week: number;
  season_type: string;
  stats: NflNormalizedStats;
};

export type NflWeeklyResponse = {
  season: number;
  week?: number;
  seasonType?: string;
  sourceUrl: string;
  rows: NflWeeklyRow[];
  coverage: {
    mappedFields: string[];
    unmappedFields: string[];
  };
};

function toNumber(value: string | undefined): number {
  if (!value) return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

async function fetchJson<T>(url: string, revalidateSeconds: number): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": "pff" },
    next: { revalidate: revalidateSeconds },
  });
  if (!res.ok) {
    throw new Error(`NFLverse request failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function getReleaseAssets(tag: string) {
  return withCache(`${NFLVERSE_REPO}/releases/tags/${tag}`, 86400, () =>
    fetchJson<{ assets: { name: string; browser_download_url: string }[] }>(
      `${NFLVERSE_REPO}/releases/tags/${tag}`,
      86400
    )
  );
}

async function getStatsPlayerWeekUrl(season: number): Promise<string> {
  for (const tag of NFLVERSE_RELEASE_TAGS) {
    try {
      const release = await getReleaseAssets(tag);
      const assetName = `${NFLVERSE_ASSET_PREFIX}${season}${NFLVERSE_ASSET_SUFFIX}`;
      const asset = release.assets?.find((item) => item.name === assetName);
      if (asset?.browser_download_url) {
        return asset.browser_download_url;
      }
    } catch (error) {
      // Try the next tag.
    }
  }

  throw new Error(`NFLverse weekly stats asset not found for season ${season}.`);
}

function mapRowToNormalized(row: Record<string, string>): NflNormalizedStats {
  const passingYards = toNumber(row.passing_yards);
  const rushingYards = toNumber(row.rushing_yards);
  const receivingYards = toNumber(row.receiving_yards);

  const fumblesLost =
    toNumber(row.rushing_fumbles_lost) +
    toNumber(row.receiving_fumbles_lost) +
    toNumber(row.sack_fumbles_lost);

  const twoPtConversions =
    toNumber(row.passing_2pt_conversions) +
    toNumber(row.rushing_2pt_conversions) +
    toNumber(row.receiving_2pt_conversions);

  return {
    passing_td: toNumber(row.passing_tds),
    passing_yards: passingYards,
    passing_interception: toNumber(row.passing_interceptions),
    rushing_td: toNumber(row.rushing_tds),
    rushing_yards: rushingYards,
    receiving_td: toNumber(row.receiving_tds),
    receiving_yards: receivingYards,
    receptions: toNumber(row.receptions),
    return_td: toNumber(row.special_teams_tds),
    fumble_lost: fumblesLost,
    two_pt_conversion: twoPtConversions,
    offensive_fumble_recovery_td: toNumber(row.fumble_recovery_tds),
  };
}

export async function fetchNflWeeklyStats(options: {
  season: number;
  week?: number;
  seasonType?: string;
  playerId?: string;
}): Promise<NflWeeklyResponse> {
  const { season, week, seasonType, playerId } = options;
  const sourceUrl = await getStatsPlayerWeekUrl(season);

  const cacheKey = `nflverse:stats_player_week:${season}`;
  const csvText = await withCache(cacheKey, 3600, async () => {
    const res = await fetch(sourceUrl, { next: { revalidate: 3600 } });
    if (!res.ok) {
      throw new Error(`NFLverse CSV fetch failed: ${res.status} ${res.statusText}`);
    }
    return res.text();
  });

  const { headers, rows } = parseCsv(csvText);
  const headerIndex = new Map(headers.map((h, idx) => [h, idx]));

  const getValue = (row: string[], key: string) => {
    const idx = headerIndex.get(key);
    if (idx === undefined) return "";
    return row[idx] ?? "";
  };

  const mappedRows: NflWeeklyRow[] = [];

  for (const row of rows) {
    const rowSeason = toNumber(getValue(row, "season"));
    if (rowSeason !== season) continue;

    const rowWeek = toNumber(getValue(row, "week"));
    if (week !== undefined && rowWeek !== week) continue;

    const rowSeasonType = getValue(row, "season_type");
    if (seasonType && rowSeasonType !== seasonType) continue;

    const rowPlayerId = getValue(row, "player_id");
    if (playerId && rowPlayerId !== playerId) continue;

    const rowObj: Record<string, string> = {};
    for (const [key, idx] of headerIndex.entries()) {
      rowObj[key] = row[idx] ?? "";
    }

    mappedRows.push({
      player_id: rowPlayerId,
      player_name: getValue(row, "player_name"),
      player_display_name: getValue(row, "player_display_name"),
      position: getValue(row, "position"),
      position_group: getValue(row, "position_group"),
      team: getValue(row, "team"),
      opponent_team: getValue(row, "opponent_team"),
      season: rowSeason,
      week: rowWeek,
      season_type: rowSeasonType,
      stats: mapRowToNormalized(rowObj),
    });
  }

  const mappedFields = [
    "passing_td",
    "passing_yards",
    "passing_interception",
    "rushing_td",
    "rushing_yards",
    "receiving_td",
    "receiving_yards",
    "receptions",
    "return_td",
    "fumble_lost",
    "two_pt_conversion",
    "offensive_fumble_recovery_td",
  ];

  const unmappedFields = [
    "passing_300_plus_bonus",
    "rushing_100_plus_bonus",
    "receiving_100_plus_bonus",
  ];

  return {
    season,
    week,
    seasonType,
    sourceUrl,
    rows: mappedRows,
    coverage: {
      mappedFields,
      unmappedFields,
    },
  };
}
