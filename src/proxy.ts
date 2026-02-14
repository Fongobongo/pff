import { NextResponse, type NextRequest } from "next/server";

// We currently do not use Server Actions in this project.
// Public instances can still receive stale Next.js action POST requests from
// old clients/caches, which causes noisy "Failed to find Server Action" logs.
// Intercept those early and return a controlled response.
export function proxy(request: NextRequest) {
  const nextAction = request.headers.get("next-action");
  if (request.method === "POST" && nextAction) {
    return NextResponse.json(
      {
        error: "stale_server_action",
        message: "Server Action id is not valid for this deployment.",
      },
      { status: 409 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
