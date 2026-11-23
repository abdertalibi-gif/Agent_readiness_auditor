import dns from "node:dns/promises";
import net from "node:net";

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecurityError";
  }
}

const DEFAULT_BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
  "169.254.169.254",
  "0.0.0.0",
]);

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map((n) => Number(n));
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

export function isPrivateIp(ipStr: string): boolean {
  const cleaned = ipStr.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  const version = net.isIP(cleaned);
  if (version === 0) return true;

  if (version === 4) {
    const n = ipv4ToInt(cleaned);
    const inRange = (start: string, maskBits: number) => {
      const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
      return (n & mask) === (ipv4ToInt(start) & mask);
    };
    return (
      inRange("0.0.0.0", 8) ||
      inRange("10.0.0.0", 8) ||
      inRange("100.64.0.0", 10) ||
      inRange("127.0.0.0", 8) ||
      inRange("169.254.0.0", 16) ||
      inRange("172.16.0.0", 12) ||
      inRange("192.0.0.0", 24) ||
      inRange("192.0.2.0", 24) ||
      inRange("192.168.0.0", 16) ||
      inRange("198.18.0.0", 15) ||
      inRange("198.51.100.0", 24) ||
      inRange("203.0.113.0", 24) ||
      inRange("224.0.0.0", 4) ||
      inRange("240.0.0.0", 4)
    );
  }

  // IPv6 checks
  if (cleaned === "::" || cleaned === "::1") return true;
  if (cleaned.startsWith("::ffff:")) {
    const mapped = cleaned.slice(7);
    if (net.isIP(mapped) === 4) return isPrivateIp(mapped);
  }
  if (cleaned.startsWith("fc") || cleaned.startsWith("fd")) return true; // unique local
  if (cleaned.startsWith("fe8") || cleaned.startsWith("fe9") || cleaned.startsWith("fea") || cleaned.startsWith("feb")) {
    return true; // link-local fe80::/10
  }
  if (cleaned.startsWith("ff")) return true; // multicast
  return false;
}

function getBlockedHostnames(): Set<string> {
  const extra = (process.env.BLOCKED_HOSTNAMES || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_BLOCKED_HOSTNAMES, ...extra]);
}

function allowPrivateRanges(): boolean {
  return process.env.ALLOW_PRIVATE_IP_RANGES === "true";
}

export function validatePublicUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  let candidate = trimmed;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new SecurityError("Invalid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SecurityError("Only http and https URLs are allowed.");
  }
  if (!parsed.host) {
    throw new SecurityError("Invalid URL.");
  }
  if (parsed.username || parsed.password) {
    throw new SecurityError("URLs with embedded credentials are not allowed.");
  }

  const host = parsed.hostname.toLowerCase().replace(/\.+$/, "");
  if (!host) {
    throw new SecurityError("URL is missing a host.");
  }

  const blocked = getBlockedHostnames();
  if (blocked.has(host)) {
    if (!(allowPrivateRanges() && net.isIP(host) !== 0)) {
      throw new SecurityError("This hostname is blocked.");
    }
  }

  if (!allowPrivateRanges() && net.isIP(host) !== 0 && isPrivateIp(host)) {
    throw new SecurityError("This URL points to a private or internal address.");
  }

  return candidate;
}

export async function validateHostnameIsPublic(hostname: string): Promise<string[]> {
  const cleanHost = hostname.replace(/^\[|\]$/g, "").replace(/\.+$/, "");
  if (net.isIP(cleanHost) !== 0) {
    if (!allowPrivateRanges() && isPrivateIp(cleanHost)) {
      throw new SecurityError("This host resolves to a private or internal address.");
    }
    return [cleanHost];
  }

  let results: { address: string }[];
  try {
    results = await dns.lookup(cleanHost, { all: true });
  } catch {
    throw new SecurityError("Unable to resolve hostname.");
  }
  const ips = Array.from(new Set(results.map((r) => r.address)));
  if (ips.length === 0) {
    throw new SecurityError("Unable to resolve hostname.");
  }
  if (!allowPrivateRanges()) {
    for (const ip of ips) {
      if (isPrivateIp(ip)) {
        throw new SecurityError("This host resolves to a private or internal address.");
      }
    }
  }
  return ips;
}

export async function validateUrlIsPublic(rawUrl: string): Promise<string> {
  const candidate = validatePublicUrl(rawUrl);
  const parsed = new URL(candidate);
  await validateHostnameIsPublic(parsed.hostname);
  return candidate;
}

export function normalizeUrl(rawUrl: string): string {
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(rawUrl.trim())
    ? rawUrl.trim()
    : `https://${rawUrl.trim()}`;
  const parsed = new URL(candidate);
  const scheme = parsed.protocol.toLowerCase();
  let host = parsed.host.toLowerCase();
  if ((scheme === "http:" && host.endsWith(":80")) || (scheme === "https:" && host.endsWith(":443"))) {
    host = host.slice(0, host.lastIndexOf(":"));
  }
  const path = parsed.pathname || "/";
  const query = parsed.search || "";
  return `${scheme}//${host}${path}${query}`;
}
