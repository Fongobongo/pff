import { NextResponse } from "next/server";
import { getSportsfunPortfolioWallets } from "@/lib/teneroSportsfun";

export const runtime = "nodejs";

export async function GET() {
  const result = await getSportsfunPortfolioWallets();
  if (result.authRequired) {
    return NextResponse.json(
      {
        error: "auth_required",
        message: "Configure TENERO_AUTH_BEARER_TOKEN for portfolio wallets access.",
      },
      { status: 401, headers: { "cache-control": "no-store" } }
    );
  }

  return NextResponse.json(
    {
      data: result.data,
    },
    {
      headers: {
        "cache-control": "s-maxage=20, stale-while-revalidate=60",
      },
    }
  );
}
