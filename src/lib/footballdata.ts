import { env } from "@/lib/env";

const FOOTBALL_DATA_BASE_URL = "https://api.football-data.org/v4";

export type FootballDataParams = Record<string, string | number | boolean | undefined>;

export async function footballDataFetch<T>(
  path: string,
  params: FootballDataParams = {},
  revalidateSeconds = 300
): Promise<T> {
  const url = new URL(`${FOOTBALL_DATA_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    url.searchParams.set(key, String(value));
  }

  const headers = new Headers();
  if (env.FOOTBALL_DATA_API_KEY) {
    headers.set("X-Auth-Token", env.FOOTBALL_DATA_API_KEY);
  }

  const res = await fetch(url, {
    headers,
    next: { revalidate: revalidateSeconds },
  });

  if (!res.ok) {
    throw new Error(`football-data.org request failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}
