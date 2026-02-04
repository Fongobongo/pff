import { parseCsv } from "@/lib/stats/csv";
import { withCache } from "@/lib/stats/cache";
import { NFL_STAT_KEYS, type NflNormalizedStats } from "@/lib/stats/types";

const NFLVERSE_RELEASE_TAGS = ["player_stats", "stats_player"] as const;
const NFLVERSE_REPO = "https://api.github.com/repos/nflverse/nflverse-data";
const NFLVERSE_ASSET_PREFIX = "stats_player_week_";
const NFLVERSE_ASSET_SUFFIX = ".csv";
const NFLVERSE_PLAYERS_TAG = "players";
const NFLVERSE_PLAYERS_ASSET = "players.csv";
const NFLVERSE_TEAMS_TAG = "teams";
const NFLVERSE_TEAMS_ASSET = "teams_colors_logos.csv";
const NFLVERSE_SCHEDULES_TAG = "schedules";
const NFLVERSE_SCHEDULES_ASSET = "games.csv";

export const NFLVERSE_MAPPED_FIELDS = [
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
] as const;

export const NFLVERSE_DERIVED_FIELDS = [
  "passing_300_plus_bonus",
  "rushing_100_plus_bonus",
  "receiving_100_plus_bonus",
] as const;

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
    scoringMissing: string[];
  };
};

export type NflPlayerRow = {
  playerId: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  positionGroup?: string;
  latestTeam?: string;
  status?: string;
  jerseyNumber?: string;
  birthDate?: string;
  height?: string;
  weight?: string;
  headshot?: string;
  collegeName?: string;
  collegeConference?: string;
  rookieSeason?: number;
  lastSeason?: number;
  yearsOfExperience?: number;
  pffId?: string;
};

export type NflPlayersResponse = {
  sourceUrl: string;
  rows: NflPlayerRow[];
};

export type NflTeamRow = {
  teamAbbr: string;
  teamName: string;
  teamId?: string;
  teamNick?: string;
  conference?: string;
  division?: string;
  color?: string;
  color2?: string;
  color3?: string;
  color4?: string;
  logoWikipedia?: string;
  logoEspn?: string;
  wordmark?: string;
  conferenceLogo?: string;
  leagueLogo?: string;
  logoSquared?: string;
};

export type NflTeamsResponse = {
  sourceUrl: string;
  rows: NflTeamRow[];
};

export type NflGameRow = {
  gameId: string;
  season: number;
  gameType?: string;
  week?: number;
  gameday?: string;
  weekday?: string;
  gametime?: string;
  awayTeam?: string;
  awayScore?: number;
  homeTeam?: string;
  homeScore?: number;
  location?: string;
  result?: number;
  total?: number;
  overtime?: number;
  stadium?: string;
};

export type NflScheduleResponse = {
  sourceUrl: string;
  rows: NflGameRow[];
};

function toNumber(value: string | undefined): number {
  if (!value) return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function toOptionalNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
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

async function getReleaseAssetsByTag(tag: string) {
  return withCache(`${NFLVERSE_REPO}/releases/tags/${tag}`, 86400, () =>
    fetchJson<{ assets: { name: string; browser_download_url: string }[] }>(
      `${NFLVERSE_REPO}/releases/tags/${tag}`,
      86400
    )
  );
}

async function getReleaseAssetUrl(tag: string, assetName: string): Promise<string> {
  const release = await getReleaseAssetsByTag(tag);
  const asset = release.assets?.find((item) => item.name === assetName);
  if (!asset?.browser_download_url) {
    throw new Error(`NFLverse asset not found: ${tag}/${assetName}`);
  }
  return asset.browser_download_url;
}

async function getStatsPlayerWeekUrl(season: number): Promise<string> {
  for (const tag of NFLVERSE_RELEASE_TAGS) {
    try {
      const assetName = `${NFLVERSE_ASSET_PREFIX}${season}${NFLVERSE_ASSET_SUFFIX}`;
      const assetUrl = await getReleaseAssetUrl(tag, assetName);
      if (assetUrl) return assetUrl;
    } catch {
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

  const coverageSet = new Set<string>([...NFLVERSE_MAPPED_FIELDS, ...NFLVERSE_DERIVED_FIELDS]);
  const scoringMissing = NFL_STAT_KEYS.filter((key) => !coverageSet.has(key));

  return {
    season,
    week,
    seasonType,
    sourceUrl,
    rows: mappedRows,
    coverage: {
      mappedFields: [...NFLVERSE_MAPPED_FIELDS],
      unmappedFields: [...NFLVERSE_DERIVED_FIELDS],
      scoringMissing,
    },
  };
}

async function fetchCsvFromAsset(tag: string, assetName: string, cacheKey: string, ttlSeconds: number) {
  const sourceUrl = await getReleaseAssetUrl(tag, assetName);
  const csvText = await withCache(cacheKey, ttlSeconds, async () => {
    const res = await fetch(sourceUrl, { next: { revalidate: ttlSeconds } });
    if (!res.ok) {
      throw new Error(`NFLverse CSV fetch failed: ${res.status} ${res.statusText}`);
    }
    return res.text();
  });
  return { sourceUrl, csvText };
}

export async function fetchNflPlayers(): Promise<NflPlayersResponse> {
  const { sourceUrl, csvText } = await fetchCsvFromAsset(
    NFLVERSE_PLAYERS_TAG,
    NFLVERSE_PLAYERS_ASSET,
    "nflverse:players",
    86400
  );

  const { headers, rows } = parseCsv(csvText);
  const headerIndex = new Map(headers.map((h, idx) => [h, idx]));
  const getValue = (row: string[], key: string) => {
    const idx = headerIndex.get(key);
    if (idx === undefined) return "";
    return row[idx] ?? "";
  };

  const mappedRows: NflPlayerRow[] = rows.map((row) => {
    const playerId = getValue(row, "gsis_id");
    return {
      playerId,
      displayName: getValue(row, "display_name") || playerId,
      firstName: getValue(row, "first_name") || undefined,
      lastName: getValue(row, "last_name") || undefined,
      position: getValue(row, "position") || undefined,
      positionGroup: getValue(row, "position_group") || undefined,
      latestTeam: getValue(row, "latest_team") || undefined,
      status: getValue(row, "status") || undefined,
      jerseyNumber: getValue(row, "jersey_number") || undefined,
      birthDate: getValue(row, "birth_date") || undefined,
      height: getValue(row, "height") || undefined,
      weight: getValue(row, "weight") || undefined,
      headshot: getValue(row, "headshot") || undefined,
      collegeName: getValue(row, "college_name") || undefined,
      collegeConference: getValue(row, "college_conference") || undefined,
      rookieSeason: toOptionalNumber(getValue(row, "rookie_season")),
      lastSeason: toOptionalNumber(getValue(row, "last_season")),
      yearsOfExperience: toOptionalNumber(getValue(row, "years_of_experience")),
      pffId: getValue(row, "pff_id") || undefined,
    };
  });

  return { sourceUrl, rows: mappedRows };
}

export async function fetchNflTeams(): Promise<NflTeamsResponse> {
  const { sourceUrl, csvText } = await fetchCsvFromAsset(
    NFLVERSE_TEAMS_TAG,
    NFLVERSE_TEAMS_ASSET,
    "nflverse:teams",
    86400
  );

  const { headers, rows } = parseCsv(csvText);
  const headerIndex = new Map(headers.map((h, idx) => [h, idx]));
  const getValue = (row: string[], key: string) => {
    const idx = headerIndex.get(key);
    if (idx === undefined) return "";
    return row[idx] ?? "";
  };

  const mappedRows: NflTeamRow[] = rows.map((row) => ({
    teamAbbr: getValue(row, "team_abbr"),
    teamName: getValue(row, "team_name"),
    teamId: getValue(row, "team_id") || undefined,
    teamNick: getValue(row, "team_nick") || undefined,
    conference: getValue(row, "team_conf") || undefined,
    division: getValue(row, "team_division") || undefined,
    color: getValue(row, "team_color") || undefined,
    color2: getValue(row, "team_color2") || undefined,
    color3: getValue(row, "team_color3") || undefined,
    color4: getValue(row, "team_color4") || undefined,
    logoWikipedia: getValue(row, "team_logo_wikipedia") || undefined,
    logoEspn: getValue(row, "team_logo_espn") || undefined,
    wordmark: getValue(row, "team_wordmark") || undefined,
    conferenceLogo: getValue(row, "team_conference_logo") || undefined,
    leagueLogo: getValue(row, "team_league_logo") || undefined,
    logoSquared: getValue(row, "team_logo_squared") || undefined,
  }));

  return { sourceUrl, rows: mappedRows };
}

export async function fetchNflSchedule(): Promise<NflScheduleResponse> {
  const { sourceUrl, csvText } = await fetchCsvFromAsset(
    NFLVERSE_SCHEDULES_TAG,
    NFLVERSE_SCHEDULES_ASSET,
    "nflverse:schedules",
    3600
  );

  const { headers, rows } = parseCsv(csvText);
  const headerIndex = new Map(headers.map((h, idx) => [h, idx]));
  const getValue = (row: string[], key: string) => {
    const idx = headerIndex.get(key);
    if (idx === undefined) return "";
    return row[idx] ?? "";
  };

  const mappedRows: NflGameRow[] = rows.map((row) => ({
    gameId: getValue(row, "game_id"),
    season: toNumber(getValue(row, "season")),
    gameType: getValue(row, "game_type") || undefined,
    week: toOptionalNumber(getValue(row, "week")),
    gameday: getValue(row, "gameday") || undefined,
    weekday: getValue(row, "weekday") || undefined,
    gametime: getValue(row, "gametime") || undefined,
    awayTeam: getValue(row, "away_team") || undefined,
    awayScore: toOptionalNumber(getValue(row, "away_score")),
    homeTeam: getValue(row, "home_team") || undefined,
    homeScore: toOptionalNumber(getValue(row, "home_score")),
    location: getValue(row, "location") || undefined,
    result: toOptionalNumber(getValue(row, "result")),
    total: toOptionalNumber(getValue(row, "total")),
    overtime: toOptionalNumber(getValue(row, "overtime")),
    stadium: getValue(row, "stadium") || undefined,
  }));

  return { sourceUrl, rows: mappedRows };
}
