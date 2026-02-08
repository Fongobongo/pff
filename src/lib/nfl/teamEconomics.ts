import { fetchNflTeams, type NflTeamRow } from "@/lib/stats/nflverse";
import {
  getSportfunMarketSnapshot,
  toUsdNumber,
  type SportfunMarketToken,
} from "@/lib/sportfunMarket";

export type NflTeamEconomicsAsset = {
  tokenIdDec: string;
  playerName: string;
  position?: string;
  priceUsd: number;
  priceChange24hPercent?: number;
};

export type NflTeamEconomicsRow = {
  teamAbbr: string;
  teamName: string;
  conference?: string;
  division?: string;
  logo?: string;
  tradeablePlayers: number;
  squadValueUsd: number;
  avgPlayerPriceUsd: number;
  topAssets: NflTeamEconomicsAsset[];
};

export type NflTeamEconomicsSnapshot = {
  asOf: string;
  source: string;
  rows: NflTeamEconomicsRow[];
};

const MANUAL_TEAM_ALIASES: Record<string, string> = {
  ARIZONA: "ARI",
  ATLANTA: "ATL",
  BALTIMORE: "BAL",
  BUFFALO: "BUF",
  CAROLINA: "CAR",
  CHICAGO: "CHI",
  CINCINNATI: "CIN",
  CLEVELAND: "CLE",
  DALLAS: "DAL",
  DENVER: "DEN",
  DETROIT: "DET",
  GREENBAY: "GB",
  GREEN_BAY: "GB",
  HOUSTON: "HOU",
  INDIANAPOLIS: "IND",
  JACKSONVILLE: "JAX",
  KANSASCITY: "KC",
  KANSAS_CITY: "KC",
  LASVEGAS: "LV",
  LAS_VEGAS: "LV",
  LACHARGERS: "LAC",
  LOSANGELESCHARGERS: "LAC",
  LOS_ANGELES_CHARGERS: "LAC",
  LARAMS: "LAR",
  LOSANGELESRAMS: "LAR",
  LOS_ANGELES_RAMS: "LAR",
  MIAMI: "MIA",
  MINNESOTA: "MIN",
  NEWENGLAND: "NE",
  NEW_ENGLAND: "NE",
  NEWORLEANS: "NO",
  NEW_ORLEANS: "NO",
  NYGIANTS: "NYG",
  NEWYORKGIANTS: "NYG",
  NEW_YORK_GIANTS: "NYG",
  NYJETS: "NYJ",
  NEWYORKJETS: "NYJ",
  NEW_YORK_JETS: "NYJ",
  PHILADELPHIA: "PHI",
  PITTSBURGH: "PIT",
  SANFRANCISCO: "SF",
  SAN_FRANCISCO: "SF",
  SEATTLE: "SEA",
  TAMPA: "TB",
  TAMPABAY: "TB",
  TAMPA_BAY: "TB",
  TENNESSEE: "TEN",
  WASHINGTON: "WAS",
};

function normalizeTeamKey(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function extractAttributeValue(
  attributes: unknown,
  matchKey: (key: string) => boolean
): unknown {
  if (!attributes) return undefined;
  if (Array.isArray(attributes)) {
    for (const entry of attributes) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const key = String(
        record.trait_type ?? record.traitType ?? record.name ?? record.key ?? ""
      ).toLowerCase();
      if (!key) continue;
      if (matchKey(key)) return record.value ?? record.val ?? record.text ?? record.content;
    }
  }
  if (typeof attributes === "object") {
    for (const [key, value] of Object.entries(attributes as Record<string, unknown>)) {
      if (matchKey(key.toLowerCase())) return value;
    }
  }
  return undefined;
}

function extractTeam(attributes: unknown): string | undefined {
  const raw = extractAttributeValue(attributes, (key) => key.includes("team") || key.includes("club"));
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return undefined;
}

function extractPosition(attributes: unknown): string | undefined {
  const raw = extractAttributeValue(attributes, (key) => key.includes("position") || key === "pos");
  if (typeof raw === "string" && raw.trim()) return raw.trim().toUpperCase();
  return undefined;
}

export function buildNflTeamAliasMap(teams: NflTeamRow[]): Map<string, string> {
  const aliases = new Map<string, string>();

  for (const team of teams) {
    const abbr = team.teamAbbr.toUpperCase();
    aliases.set(abbr, abbr);

    const teamName = normalizeTeamKey(team.teamName);
    if (teamName) aliases.set(teamName, abbr);

    const teamNick = normalizeTeamKey(team.teamNick ?? "");
    if (teamNick) aliases.set(teamNick, abbr);

    const confNick = normalizeTeamKey(`${team.teamName} ${team.teamNick ?? ""}`);
    if (confNick) aliases.set(confNick, abbr);
  }

  for (const [key, abbr] of Object.entries(MANUAL_TEAM_ALIASES)) {
    aliases.set(key, abbr);
  }

  return aliases;
}

export function normalizeNflTeamAbbr(
  teamValue: string | undefined,
  aliasMap: Map<string, string>
): string | undefined {
  if (!teamValue) return undefined;
  const normalized = normalizeTeamKey(teamValue);
  if (!normalized) return undefined;
  if (aliasMap.has(normalized)) return aliasMap.get(normalized);

  const compact = normalized.replace(/_/g, "");
  if (aliasMap.has(compact)) return aliasMap.get(compact);

  return undefined;
}

export function computeNflTeamEconomicsRows(params: {
  teams: NflTeamRow[];
  tokens: SportfunMarketToken[];
}): NflTeamEconomicsRow[] {
  const aliasMap = buildNflTeamAliasMap(params.teams);

  const teamMap = new Map<string, NflTeamEconomicsRow & { assets: NflTeamEconomicsAsset[] }>();

  for (const team of params.teams) {
    teamMap.set(team.teamAbbr.toUpperCase(), {
      teamAbbr: team.teamAbbr.toUpperCase(),
      teamName: team.teamName,
      conference: team.conference,
      division: team.division,
      logo: team.logoEspn ?? team.logoSquared ?? team.logoWikipedia,
      tradeablePlayers: 0,
      squadValueUsd: 0,
      avgPlayerPriceUsd: 0,
      topAssets: [],
      assets: [],
    });
  }

  for (const token of params.tokens) {
    if (!token.currentPriceUsdcRaw) continue;

    const teamHint = token.team ?? extractTeam(token.attributes);
    const teamAbbr = normalizeNflTeamAbbr(teamHint, aliasMap);
    if (!teamAbbr) continue;

    const row = teamMap.get(teamAbbr);
    if (!row) continue;

    const priceUsd = toUsdNumber(token.currentPriceUsdcRaw);
    row.tradeablePlayers += 1;
    row.squadValueUsd += priceUsd;

    row.assets.push({
      tokenIdDec: token.tokenIdDec,
      playerName: token.name ?? `#${token.tokenIdDec}`,
      position: token.position ?? extractPosition(token.attributes),
      priceUsd,
      priceChange24hPercent: token.priceChange24hPercent,
    });
  }

  const rows = Array.from(teamMap.values()).map((row) => {
    const topAssets = row.assets
      .slice()
      .sort((a, b) => b.priceUsd - a.priceUsd)
      .slice(0, 3)
      .map((asset) => ({
        ...asset,
        priceUsd: Number(asset.priceUsd.toFixed(6)),
      }));

    return {
      teamAbbr: row.teamAbbr,
      teamName: row.teamName,
      conference: row.conference,
      division: row.division,
      logo: row.logo,
      tradeablePlayers: row.tradeablePlayers,
      squadValueUsd: Number(row.squadValueUsd.toFixed(6)),
      avgPlayerPriceUsd: Number(
        (row.tradeablePlayers > 0 ? row.squadValueUsd / row.tradeablePlayers : 0).toFixed(6)
      ),
      topAssets,
    };
  });

  rows.sort((a, b) => a.teamAbbr.localeCompare(b.teamAbbr));
  return rows;
}

export async function buildNflTeamEconomicsSnapshot(options?: {
  maxTokens?: number;
}): Promise<NflTeamEconomicsSnapshot> {
  const maxTokens = options?.maxTokens ?? 1000;

  const [teams, market] = await Promise.all([
    fetchNflTeams(),
    getSportfunMarketSnapshot({
      sport: "nfl",
      windowHours: 24,
      trendDays: 30,
      maxTokens,
    }),
  ]);

  return {
    asOf: market.asOf,
    source: "sportfun_onchain+nflverse",
    rows: computeNflTeamEconomicsRows({
      teams: teams.rows,
      tokens: market.tokens,
    }),
  };
}
