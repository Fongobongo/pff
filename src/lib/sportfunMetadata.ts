import type { SportfunTokenMetadata } from "@/lib/sportfunMetadataCache";
import { getSportfunAthleteMetadataDefaults } from "@/lib/sportfun";

type SportfunMetadataResolution = {
  metadata: SportfunTokenMetadata | null;
  resolvedUri?: string | null;
  error?: string;
};

const DEFAULT_REVALIDATE_SECONDS = 60 * 60 * 24;

function formatErc1155TokenIdHex(tokenId: bigint): string {
  return tokenId.toString(16).padStart(64, "0");
}

export function expandErc1155Uri(template: string, tokenId: bigint): string {
  return template.replace(/\{id\}/gi, formatErc1155TokenIdHex(tokenId));
}

export function normalizeToHttp(uri: string): string {
  if (uri.startsWith("ipfs://")) {
    let rest = uri.slice("ipfs://".length);
    if (rest.startsWith("ipfs/")) rest = rest.slice("ipfs/".length);
    return `https://ipfs.io/ipfs/${rest}`;
  }
  if (uri.startsWith("ar://")) {
    return `https://arweave.net/${uri.slice("ar://".length)}`;
  }
  return uri;
}

export function decodeDataUriJson(uri: string): unknown | null {
  if (!uri.startsWith("data:")) return null;
  const idx = uri.indexOf(",");
  if (idx === -1) return null;
  const meta = uri.slice(0, idx);
  const payload = uri.slice(idx + 1);
  if (!meta.includes("application/json")) return null;
  try {
    if (meta.includes(";base64")) {
      const raw = Buffer.from(payload, "base64").toString("utf8");
      return JSON.parse(raw);
    }
    const raw = decodeURIComponent(payload);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isNumericUri(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

export function parseErc1155Metadata(metadata: unknown): SportfunTokenMetadata | null {
  if (!metadata || typeof metadata !== "object") return null;
  const obj = metadata as Record<string, unknown>;
  const name = typeof obj.name === "string" ? obj.name : undefined;
  const description = typeof obj.description === "string" ? obj.description : undefined;
  const image =
    typeof obj.image_url === "string"
      ? obj.image_url
      : typeof obj.image === "string"
        ? obj.image
        : undefined;
  const attributes = obj.attributes;
  if (!name && !description && !image && !attributes) return null;
  return { name, description, image, attributes };
}

function applyTemplate(template: string, id: string): string {
  if (template.includes("{id}")) return template.replace(/\{id\}/gi, id);
  return template;
}

export function buildSportfunMetadataCandidates(params: {
  uriRaw: string;
  tokenId: bigint;
  template?: string;
  defaultTemplate?: string;
}): string[] {
  const { template: envTemplate, defaultTemplate } = getSportfunAthleteMetadataDefaults();
  const template = params.template ?? envTemplate;
  const fallbackTemplate = params.defaultTemplate ?? defaultTemplate;
  const candidates: string[] = [];
  const tokenIdDec = params.tokenId.toString(10);

  const add = (url?: string | null) => {
    if (!url) return;
    if (!candidates.includes(url)) candidates.push(url);
  };

  const trimmed = params.uriRaw.trim();
  if (trimmed) {
    if (isNumericUri(trimmed)) {
      add(applyTemplate(template, trimmed));
    } else {
      const expanded = expandErc1155Uri(trimmed, params.tokenId);
      if (isNumericUri(expanded)) {
        add(applyTemplate(template, expanded));
      } else {
        add(normalizeToHttp(expanded));
      }
    }
  }

  add(applyTemplate(template, tokenIdDec));
  if (fallbackTemplate !== template) {
    add(applyTemplate(fallbackTemplate, tokenIdDec));
  }

  return candidates;
}

async function fetchMetadataJson(url: string, revalidateSeconds = DEFAULT_REVALIDATE_SECONDS): Promise<unknown | null> {
  const res = await fetch(url, { next: { revalidate: revalidateSeconds } });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function resolveSportfunMetadataFromUri(params: {
  uriRaw: string;
  tokenId: bigint;
  template?: string;
  defaultTemplate?: string;
  revalidateSeconds?: number;
}): Promise<SportfunMetadataResolution> {
  const trimmed = params.uriRaw.trim();
  if (!trimmed) return { metadata: null };

  const jsonInline = decodeDataUriJson(trimmed);
  if (jsonInline) {
    return { metadata: parseErc1155Metadata(jsonInline) };
  }

  const candidates = buildSportfunMetadataCandidates({
    uriRaw: trimmed,
    tokenId: params.tokenId,
    template: params.template,
    defaultTemplate: params.defaultTemplate,
  });

  let lastError: string | undefined;
  for (const url of candidates) {
    try {
      const payload = await fetchMetadataJson(url, params.revalidateSeconds);
      const parsed = parseErc1155Metadata(payload);
      if (parsed) {
        return { metadata: parsed, resolvedUri: url };
      }
      if (!payload) {
        lastError = `Metadata fetch failed for ${url}`;
      } else {
        lastError = `Metadata parse failed for ${url}`;
      }
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    metadata: null,
    resolvedUri: candidates[0] ?? null,
    error: lastError,
  };
}
