import { bindings } from "@/db/runtime";
import { randomToken } from "./token-crypto.ts";
import {
  validateRelayDeliveryResponse,
  validateRelayReceiveResponse,
  validateWhisperAudio,
  WHISPER_RELAY_TTL_SECONDS,
} from "./voice-whisper-validation.ts";
export {
  validateRelayDeliveryResponse,
  validateRelayReceiveResponse,
  validateWhisperAudio,
  WHISPER_CONTENT_TYPES,
  WHISPER_MAX_BYTES,
  WHISPER_MAX_DURATION_MS,
  WHISPER_MIN_BYTES,
  WHISPER_RELAY_TTL_SECONDS,
} from "./voice-whisper-validation.ts";

export function voiceWhisperCapability() {
  const requested = process.env.WIGGLE_VOICE_WHISPER_ENABLED === "true";
  const relay = bindings().WHISPER_RELAY;
  if (!requested) return { enabled: false as const, reason: "disabled-by-default" as const };
  if (!relay) return { enabled: false as const, reason: "durable-relay-binding-required" as const };
  return { enabled: true as const, reason: null, relay };
}

export async function deliverTransientWhisper(input: { studentId: string; bytes: ArrayBuffer; contentType: string; durationMs: number }) {
  const capability = voiceWhisperCapability();
  if (!capability.enabled) return { ok: false as const, reason: capability.reason };
  const audio = validateWhisperAudio(input);
  if (!audio.ok) return audio;
  const deliveryNonce = randomToken(18);
  const response = await capability.relay.fetch(new Request("https://wiggle-whisper.internal/deliver", {
    method: "POST",
    headers: {
      "content-type": audio.contentType,
      "x-wiggle-student": input.studentId,
      "x-wiggle-duration-ms": String(input.durationMs),
      "x-wiggle-ttl-seconds": String(WHISPER_RELAY_TTL_SECONDS),
      "x-wiggle-single-consume": "required",
      "x-wiggle-replay-protection": "required",
      "x-wiggle-delivery-nonce": deliveryNonce,
      "cache-control": "no-store",
    },
    body: input.bytes,
  }));
  return validateRelayDeliveryResponse(response, deliveryNonce)
    ? { ok: true as const }
    : { ok: false as const, reason: "unsupported_relay_contract" as const };
}

export async function receiveTransientWhisper(studentId: string) {
  const capability = voiceWhisperCapability();
  if (!capability.enabled) return null;
  const receiveNonce = randomToken(18);
  const response = await capability.relay.fetch(new Request("https://wiggle-whisper.internal/receive", {
    headers: {
      "x-wiggle-student": studentId,
      "x-wiggle-single-consume": "required",
      "x-wiggle-replay-protection": "required",
      "x-wiggle-receive-nonce": receiveNonce,
      "cache-control": "no-store",
    },
  }));
  if (response.status === 204 || !validateRelayReceiveResponse(response, receiveNonce)) return null;
  const bytes = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") ?? "";
  const durationMs = Number(response.headers.get("x-wiggle-duration-ms"));
  const audio = validateWhisperAudio({ bytes, contentType, durationMs });
  return audio.ok ? { bytes, contentType: audio.contentType } : null;
}
