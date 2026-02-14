import { NextResponse } from "next/server";
import { ZodError } from "zod";

function upstreamStatusFromMessage(message: string): number {
  const normalized = message.toLowerCase();
  if (normalized.includes("404") || normalized.includes("not found")) {
    return 404;
  }
  return 502;
}

export function statsApiErrorResponse(error: unknown, fallbackMessage = "Upstream request failed") {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "invalid_query",
        message: "Invalid query parameters.",
        issues: error.issues,
      },
      { status: 400 }
    );
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  const status = upstreamStatusFromMessage(message);

  return NextResponse.json(
    {
      error: status === 404 ? "upstream_not_found" : "upstream_error",
      message,
    },
    { status }
  );
}
