import "server-only";
import { headers } from "next/headers";

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export async function getBaseUrl(): Promise<string> {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL;
  if (explicit && /^https?:\/\//i.test(explicit)) {
    return stripTrailingSlash(explicit);
  }

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;

  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  if (host) {
    const proto = hdrs.get("x-forwarded-proto") ?? "http";
    return `${proto}://${host}`;
  }

  return "http://127.0.0.1:3000";
}
