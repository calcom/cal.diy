import dns from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { IS_SELF_HOSTED } from "@calcom/lib/constants";
import logger from "@calcom/lib/logger";

const log: ReturnType<typeof logger.getSubLogger> = logger.getSubLogger({ prefix: ["ssrf-protection"] });

/**
 * SSRF protection helpers for server-side URL fetching
 *
 * Use when fetching user-controlled URLs (logos, avatars, webhooks) to prevent
 * access to internal networks and cloud metadata services
 */

const BLOCKED_IP_RANGES: readonly string[] = [
  "unspecified", // 0.0.0.0/8, ::/128
  "loopback", // 127.0.0.0/8, ::1/128
  "private", // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
  "linkLocal", // 169.254.0.0/16, fe80::/10
  "uniqueLocal", // fc00::/7
  "carrierGradeNat", // 100.64.0.0/10 (RFC 6598)
  "reserved", // Documentation ranges (RFC 5737), etc.
  "benchmarking", // 198.18.0.0/15 (RFC 2544)
] as const;

// Cloud metadata endpoints (blocked even on self-hosted)
const CLOUD_METADATA_ENDPOINTS: string[] = [
  "169.254.169.254", // AWS/Azure/DigitalOcean/Oracle metadata
  "169.254.169.253", // Azure alternate
  "169.254.170.2", // AWS ECS container metadata
  "100.100.100.200", // Alibaba Cloud metadata
  "metadata.google.internal", // GCP metadata
  "metadata.google.com", // GCP alternate
  "fd00:ec2::254", // AWS IPv6 IMDSv2 metadata
];

const LOOPBACK_HOSTNAMES: string[] = ["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"];

// Hostnames blocked on Cal.diy SaaS (includes metadata + loopback)
const BLOCKED_HOSTNAMES: string[] = [...CLOUD_METADATA_ENDPOINTS, ...LOOPBACK_HOSTNAMES];

const CAL_AVATAR_PATH_REGEX = /^\/api\/avatar\/.+\.png$/;

const ERRORS = {
  HTTPS_ONLY: "Only HTTPS URLs are allowed",
  INVALID_PROTOCOL: "Only HTTP and HTTPS protocols are allowed",
  PRIVATE_IP: "Private IP address",
  PRIVATE_IP_DNS: "Hostname resolves to private IP",
  BLOCKED_HOSTNAME: "Blocked hostname",
  INVALID_URL: "Invalid URL format",
  NON_IMAGE_DATA_URL: "Non-image data URL",
} as const;

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "");
}

function stripIPv6Brackets(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

export function isPrivateIP(ip: string): boolean {
  const cleanIp = stripIPv6Brackets(ip);

  if (!ipaddr.isValid(cleanIp)) {
    return true;
  }

  try {
    const addr = ipaddr.parse(cleanIp);

    if (addr.kind() === "ipv6") {
      const ipv6 = addr as ipaddr.IPv6;
      if (ipv6.isIPv4MappedAddress()) {
        const ipv4 = ipv6.toIPv4Address();
        return BLOCKED_IP_RANGES.includes(ipv4.range());
      }
    }

    return BLOCKED_IP_RANGES.includes(addr.range());
  } catch {
    // If parsing fails, treat as blocked for safety
    return true;
  }
}

// Check if hostname is a blocked cloud metadata endpoint or localhost
export function isBlockedHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return BLOCKED_HOSTNAMES.includes(normalized);
}

// Check if hostname is a cloud metadata endpoint (blocked even on self-hosted)
function isCloudMetadataEndpoint(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return CLOUD_METADATA_ENDPOINTS.includes(normalized);
}

export interface SSRFValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Core validation logic shared by sync and async versions
 * Returns SSRFValidationResult if validation completes, or { url } if DNS check is needed
 */
function validateUrlCore(urlString: string): SSRFValidationResult | { url: URL } {
  // Data URLs with image/* are safe (no network fetch)
  if (urlString.startsWith("data:image/")) {
    return { isValid: true };
  }

  if (urlString.startsWith("data:")) {
    return { isValid: false, error: ERRORS.NON_IMAGE_DATA_URL };
  }

  if (CAL_AVATAR_PATH_REGEX.test(urlString)) {
    return { isValid: true };
  }

  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { isValid: false, error: ERRORS.INVALID_URL };
  }

  // E2E tests: allow localhost only
  if (process.env.NEXT_PUBLIC_IS_E2E === "1") {
    const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (isLocalhost) {
      return { isValid: true };
    }
  }

  // Always block cloud metadata endpoints (even self-hosted may run on AWS/GCP/Azure)
  if (isCloudMetadataEndpoint(url.hostname)) {
    return { isValid: false, error: ERRORS.BLOCKED_HOSTNAME };
  }

  // Self-hosted: allow HTTP and private IPs (for internal webhooks)
  // Still restrict to HTTP/HTTPS protocols only (no file://, ftp://, etc.)
  if (IS_SELF_HOSTED) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { isValid: false, error: ERRORS.INVALID_PROTOCOL };
    }
    return { isValid: true };
  }

  if (url.protocol !== "https:") {
    return { isValid: false, error: ERRORS.HTTPS_ONLY };
  }

  if (isBlockedHostname(url.hostname)) {
    return { isValid: false, error: ERRORS.BLOCKED_HOSTNAME };
  }

  // Check if hostname is an IP address and if it's private
  const hostnameForIPCheck = stripIPv6Brackets(url.hostname);
  if (ipaddr.isValid(hostnameForIPCheck) && isPrivateIP(hostnameForIPCheck)) {
    return { isValid: false, error: ERRORS.PRIVATE_IP };
  }

  return { url };
}

/**
 * Async SSRF validation with DNS rebinding protection
 * Resolves hostname and checks all IPs against private ranges
 */
export async function validateUrlForSSRF(urlString: string): Promise<SSRFValidationResult> {
  const result = validateUrlCore(urlString);

  if ("isValid" in result) {
    return result;
  }

  // DNS rebinding protection: resolve IPs and check each one
  try {
    const addresses = await dns.lookup(result.url.hostname, { all: true });
    for (const { address } of addresses) {
      if (isPrivateIP(address)) {
        return { isValid: false, error: ERRORS.PRIVATE_IP_DNS };
      }
    }
  } catch {
    // Allow DNS failures to avoid breaking legitimate hosts with flaky DNS
  }

  return { isValid: true };
}

/**
 * Sync SSRF validation for Zod schemas (no DNS check)
 * Does not protect against DNS rebinding - use async version when possible
 */
export function validateUrlForSSRFSync(urlString: string): SSRFValidationResult {
  const result = validateUrlCore(urlString);

  if ("isValid" in result) {
    return result;
  }

  return { isValid: true };
}

// Check if URL belongs to the same origin as the webapp (trusted internal URL)
export function isTrustedInternalUrl(url: string, webappUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(webappUrl).origin;
  } catch {
    return false;
  }
}

// Sanitize URL for logging - removes query params and credentials that may contain secrets
function sanitizeUrlForLog(urlString: string): string {
  try {
    const url = new URL(urlString);
    // Only log origin + pathname, exclude query params, hash, and credentials
    return `${url.origin}${url.pathname}`.substring(0, 100);
  } catch {
    // If URL parsing fails, truncate and redact potential secrets
    return `${urlString.substring(0, 50).replace(/[?#].*$/, "")}...`;
  }
}

// Log blocked SSRF attempts for security monitoring and incident response
export function logBlockedSSRFAttempt(url: string, reason: string, context?: Record<string, unknown>): void {
  log.warn("SSRF attempt blocked", {
    url: sanitizeUrlForLog(url),
    reason,
    ...context,
  });
}
