import { z } from "zod";
import { withCache } from "@/lib/stats/cache";

const DEFAULT_SOCCER_DIRECTORY_URL = "https://nfl-fun.vercel.app/data/soccer/players.json";
const DIRECTORY_CACHE_TTL_SECONDS = 60 * 10;

const fixtureTeamSchema = z
  .object({
    name: z.string().optional(),
    acronym: z.string().optional(),
  })
  .passthrough();

const fixtureCompetitionSchema = z
  .object({
    name: z.string().optional(),
    shortName: z.string().nullable().optional(),
  })
  .passthrough();

const fixtureSchema = z
  .object({
    id: z.string().optional(),
    date: z.string().optional(),
    status: z.string().optional(),
    homeTeam: fixtureTeamSchema.optional(),
    awayTeam: fixtureTeamSchema.optional(),
    competition: fixtureCompetitionSchema.optional(),
  })
  .passthrough();

const globalSharesSchema = z
  .object({
    active: z.number().optional(),
    circulating: z.number().optional(),
  })
  .passthrough();

const soccerDirectoryPlayerSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    knownName: z.string().nullable().optional(),
    team: z.string().optional(),
    position: z.string().optional(),
    age: z.number().optional(),
    countryIcon: z.string().optional(),
    shirtNumber: z.number().optional(),
    priceUsd: z.number().optional(),
    priceUsd24hChange: z.number().optional(),
    priceChange1h: z.number().optional(),
    priceChange24h: z.number().optional(),
    priceChange7d: z.number().optional(),
    priceChange30d: z.number().optional(),
    buyAvailability: z.number().optional(),
    sellAvailability: z.number().optional(),
    marketCapUsd: z.number().optional(),
    totalRewards: z.number().optional(),
    rewardsPerGame: z.number().optional(),
    rewardsPerDollar: z.number().optional(),
    rewardsToMarketCapRatio: z.number().optional(),
    appearances: z.number().optional(),
    globalShares: globalSharesSchema.optional(),
    lastUpdated: z.string().optional(),
    priceLastUpdated: z.string().optional(),
    upcomingFixturesCount: z.number().optional(),
    upcomingFixtures: z.array(fixtureSchema).optional(),
  })
  .passthrough();

const soccerDirectorySchema = z.array(soccerDirectoryPlayerSchema);

export type SoccerDirectoryPlayer = z.infer<typeof soccerDirectoryPlayerSchema>;
export type SoccerDirectoryFixture = z.infer<typeof fixtureSchema>;

function getDirectoryUrl(): string {
  const override = process.env.SOCCER_PLAYERS_DATA_URL?.trim();
  return override && override.length > 0 ? override : DEFAULT_SOCCER_DIRECTORY_URL;
}

export function normalizeSoccerPlayerName(value: string | undefined | null): string {
  if (!value) return "";
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getSoccerPlayerDisplayName(player: SoccerDirectoryPlayer): string {
  const knownName = typeof player.knownName === "string" ? player.knownName.trim() : "";
  if (knownName) return knownName;
  const directName = player.name?.trim();
  if (directName) return directName;
  const assembled = [player.firstName, player.lastName].filter(Boolean).join(" ").trim();
  return assembled || player.id;
}

export function buildSoccerPlayerIdIndexByName(players: SoccerDirectoryPlayer[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const player of players) {
    const key = normalizeSoccerPlayerName(getSoccerPlayerDisplayName(player));
    if (!key || index.has(key)) continue;
    index.set(key, player.id);
  }
  return index;
}

export async function fetchSoccerDirectoryPlayers(): Promise<SoccerDirectoryPlayer[]> {
  const url = getDirectoryUrl();
  return withCache(`soccer:directory:${url}`, DIRECTORY_CACHE_TTL_SECONDS, async () => {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Soccer directory request failed: ${response.status} ${response.statusText}`);
    }

    const raw = await response.json();
    const parsed = soccerDirectorySchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error("Soccer directory payload is invalid.");
    }
    return parsed.data;
  });
}
