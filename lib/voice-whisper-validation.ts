export const WHISPER_MAX_BYTES = 384_000;
export const WHISPER_MIN_BYTES = 12;
export const WHISPER_MAX_DURATION_MS = 12_000;
export const WHISPER_RELAY_TTL_SECONDS = 30;
export const WHISPER_CONTENT_TYPES = ["audio/webm", "audio/ogg", "audio/mp4"] as const;
export type WhisperContentType = (typeof WHISPER_CONTENT_TYPES)[number];

function baseContentType(value: string): WhisperContentType | null {
  const base = value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return WHISPER_CONTENT_TYPES.includes(base as WhisperContentType) ? base as WhisperContentType : null;
}

function hasMagic(bytes: Uint8Array, contentType: WhisperContentType) {
  if (contentType === "audio/webm") return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (contentType === "audio/ogg") return bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53;
  return bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
}

export function validateWhisperAudio(input: { bytes: ArrayBuffer; contentType: string; durationMs: number }) {
  const contentType = baseContentType(input.contentType);
  const byteLength = input.bytes.byteLength;
  if (!contentType
    || !Number.isFinite(input.durationMs)
    || !Number.isInteger(input.durationMs)
    || input.durationMs < 1
    || input.durationMs > WHISPER_MAX_DURATION_MS
    || byteLength < WHISPER_MIN_BYTES
    || byteLength > WHISPER_MAX_BYTES
    || !hasMagic(new Uint8Array(input.bytes), contentType)) {
    return { ok: false as const, reason: "invalid_audio" as const };
  }
  return { ok: true as const, contentType };
}

function validReceipt(value: string | null) {
  return Boolean(value && /^[A-Za-z0-9_-]{16,200}$/.test(value));
}

export function validateRelayDeliveryResponse(response: Response, deliveryNonce: string) {
  const ttl = Number(response.headers.get("x-wiggle-relay-ttl-seconds"));
  return response.ok
    && Number.isInteger(ttl)
    && ttl >= 1
    && ttl <= WHISPER_RELAY_TTL_SECONDS
    && response.headers.get("x-wiggle-single-consume") === "enforced"
    && response.headers.get("x-wiggle-replay-protection") === "enforced"
    && response.headers.get("x-wiggle-delivery-nonce") === deliveryNonce
    && validReceipt(response.headers.get("x-wiggle-receipt"));
}

export function validateRelayReceiveResponse(response: Response, receiveNonce: string, now = new Date()) {
  const expiresAt = Date.parse(response.headers.get("x-wiggle-expires-at") ?? "");
  const remaining = expiresAt - now.getTime();
  return response.ok
    && response.status === 200
    && response.headers.get("x-wiggle-single-consume") === "enforced"
    && response.headers.get("x-wiggle-replay-protection") === "enforced"
    && response.headers.get("x-wiggle-replay-denied") === "true"
    && response.headers.get("x-wiggle-consumed") === "true"
    && response.headers.get("x-wiggle-receive-nonce") === receiveNonce
    && validReceipt(response.headers.get("x-wiggle-receipt"))
    && Number.isFinite(expiresAt)
    && remaining > 0
    && remaining <= WHISPER_RELAY_TTL_SECONDS * 1000;
}
