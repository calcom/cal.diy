import { createHmac } from "node:crypto";
import process from "node:process";

// 262992 minutes is 6 months
export function generateVideoToken(recordingId: string, expiresInMinutes = 262992) {
  const secret = process.env.CAL_VIDEO_RECORDING_TOKEN_SECRET || "default-secret-change-me";
  const expires = Date.now() + expiresInMinutes * 60 * 1000;

  const payload = `${recordingId}:${expires}`;
  const hmac = createHmac("sha256", secret).update(payload).digest("hex");

  return `${payload}:${hmac}`;
}

export function verifyVideoToken(token: string): {
  valid: boolean;
  recordingId?: string;
} {
  try {
    const [recordingId, expires, receivedHmac] = token.split(":");
    const secret = process.env.CAL_VIDEO_RECORDING_TOKEN_SECRET || "default-secret-change-me";

    if (Date.now() > parseInt(expires, 10)) {
      return { valid: false };
    }

    // Verify HMAC
    const payload = `${recordingId}:${expires}`;
    const expectedHmac = createHmac("sha256", secret).update(payload).digest("hex");

    if (receivedHmac !== expectedHmac) {
      return { valid: false };
    }

    return { valid: true, recordingId };
  } catch {
    return { valid: false };
  }
}
