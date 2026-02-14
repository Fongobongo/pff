import { NextResponse } from "next/server";
import {
  isSportfunPriceStoreConfigured,
  refreshSportfunExternalPrices,
} from "@/lib/sportfunPrices";

export const runtime = "nodejs";

export async function GET() {
  const result = await refreshSportfunExternalPrices({ reason: "manual_refresh_endpoint" });
  return NextResponse.json({
    ok: result.status === "ok",
    storeConfigured: isSportfunPriceStoreConfigured(),
    ...result,
  });
}

export async function POST() {
  return GET();
}
