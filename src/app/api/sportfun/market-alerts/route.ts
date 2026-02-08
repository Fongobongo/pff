import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  acknowledgeMarketAlertById,
  acknowledgeMarketAlerts,
  getMarketAlerts,
  setMarketAlertMute,
  type MarketAlertSport,
  type MarketAlertType,
} from "@/lib/marketAlertSink";
import { env } from "@/lib/env";

export const runtime = "nodejs";

const querySchema = z.object({
  limit: z.string().optional(),
  sport: z.enum(["nfl", "soccer"]).optional(),
  type: z.enum(["fallback_stale_feed", "unresolved_share_high"]).optional(),
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ack"),
    alertId: z.string().min(1),
  }),
  z.object({
    action: z.literal("ack_all"),
    sport: z.enum(["nfl", "soccer"]).optional(),
    type: z.enum(["fallback_stale_feed", "unresolved_share_high"]).optional(),
  }),
  z.object({
    action: z.literal("mute"),
    sport: z.enum(["nfl", "soccer"]),
    type: z.enum(["fallback_stale_feed", "unresolved_share_high"]),
    reason: z.string().max(240).optional(),
  }),
  z.object({
    action: z.literal("unmute"),
    sport: z.enum(["nfl", "soccer"]),
    type: z.enum(["fallback_stale_feed", "unresolved_share_high"]),
  }),
]);

function parseLimit(value: string | undefined): number {
  const fallback = 50;
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(200, Math.trunc(parsed)));
}

function parseBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const value = authorization.trim();
  const prefix = "Bearer ";
  if (!value.startsWith(prefix)) return null;
  const token = value.slice(prefix.length).trim();
  return token || null;
}

function tokensEqual(expected: string, provided: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length !== right.length) return false;
  try {
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function getProvidedAdminToken(request: Request): string | null {
  const custom = request.headers.get("x-market-alert-admin-token");
  if (custom && custom.trim()) return custom.trim();
  return parseBearerToken(request.headers.get("authorization"));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = querySchema.parse({
    limit: searchParams.get("limit") ?? undefined,
    sport: searchParams.get("sport") ?? undefined,
    type: searchParams.get("type") ?? undefined,
  });

  const payload = await getMarketAlerts({
    limit: parseLimit(query.limit),
    sport: query.sport as MarketAlertSport | undefined,
    type: query.type as MarketAlertType | undefined,
  });

  return NextResponse.json(payload, {
    headers: {
      "cache-control": "no-store",
      "x-market-alerts-mutations-auth":
        env.MARKET_ALERT_ADMIN_TOKEN && env.MARKET_ALERT_ADMIN_TOKEN.trim()
          ? "configured"
          : "missing",
    },
  });
}

export async function POST(request: Request) {
  const expectedToken = env.MARKET_ALERT_ADMIN_TOKEN?.trim();
  if (!expectedToken) {
    return NextResponse.json(
      {
        error:
          "Alert mutations are disabled: MARKET_ALERT_ADMIN_TOKEN is not configured on the server.",
      },
      { status: 503 }
    );
  }
  const providedToken = getProvidedAdminToken(request);
  if (!providedToken || !tokensEqual(expectedToken, providedToken)) {
    return NextResponse.json(
      { error: "Unauthorized: missing or invalid admin token." },
      {
        status: 401,
        headers: {
          "www-authenticate": 'Bearer realm="market-alerts-admin"',
        },
      }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = actionSchema.safeParse(body);
  if (!action.success) {
    return NextResponse.json(
      { error: "Invalid action payload", issues: action.error.issues },
      { status: 400 }
    );
  }

  switch (action.data.action) {
    case "ack": {
      const result = await acknowledgeMarketAlertById(action.data.alertId);
      return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
    }
    case "ack_all": {
      const result = await acknowledgeMarketAlerts({
        sport: action.data.sport as MarketAlertSport | undefined,
        type: action.data.type as MarketAlertType | undefined,
      });
      return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
    }
    case "mute": {
      const result = await setMarketAlertMute({
        sport: action.data.sport,
        type: action.data.type,
        muted: true,
        reason: action.data.reason,
      });
      return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
    }
    case "unmute": {
      const result = await setMarketAlertMute({
        sport: action.data.sport,
        type: action.data.type,
        muted: false,
      });
      return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
    }
    default:
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }
}
