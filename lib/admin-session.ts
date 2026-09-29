/**
 * Admin session signing.
 *
 * Deliberately built on Web Crypto rather than node:crypto so the same code
 * runs in the Edge middleware and in the Node route handlers. A session is a
 * signed, httpOnly cookie: `<base64url(payload)>.<base64url(HMAC)>`.
 *
 * The HMAC key is ADMIN_PASSWORD itself. That means rotating the password
 * invalidates every outstanding session, which is the behaviour you want.
 *
 * This is deliberately minimal. It is one shared password protecting one
 * moderation panel, not a multi-user identity system.
 */

export const ADMIN_COOKIE = "devlore_admin";
export const ADMIN_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

interface AdminPayload {
  /** Issued-at, seconds. */
  iat: number;
  /** Expiry, seconds. */
  exp: number;
  /** Format version, so a future change can invalidate old cookies. */
  v: 1;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const bin = atob(b64 + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function importKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/** True when an admin password is configured. Admin is fail-closed without one. */
export function isAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

/** Mint a signed session token. Returns null when no password is configured. */
export async function createAdminToken(now = Date.now()): Promise<string | null> {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) return null;

  const seconds = Math.floor(now / 1000);
  const payload: AdminPayload = { iat: seconds, exp: seconds + ADMIN_TTL_MS / 1000, v: 1 };
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));

  const key = await importKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));

  return `${payloadB64}.${toBase64Url(new Uint8Array(sig))}`;
}

/**
 * Verify a session token.
 *
 * The signature is checked before the payload is parsed, so a tampered cookie
 * is rejected on the signature rather than being trusted and then validated.
 * crypto.subtle.verify performs the comparison in constant time.
 */
export async function verifyAdminToken(token: string | undefined | null): Promise<boolean> {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret || !token) return false;

  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;

  const payloadB64 = token.slice(0, dot);
  const sigBytes = fromBase64Url(token.slice(dot + 1));
  if (!sigBytes) return false;

  try {
    const key = await importKey(secret);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes as unknown as ArrayBuffer,
      new TextEncoder().encode(payloadB64)
    );
    if (!ok) return false;

    const parsed = JSON.parse(
      new TextDecoder().decode(fromBase64Url(payloadB64) ?? new Uint8Array())
    ) as Partial<AdminPayload>;

    if (parsed.v !== 1 || typeof parsed.exp !== "number") return false;
    // Expiry is checked after the signature, so it cannot be forged.
    return parsed.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export const ADMIN_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "strict",
  secure: true,
  path: "/",
  maxAge: ADMIN_TTL_MS / 1000,
} as const;
