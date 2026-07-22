export type ParsedImage = { bytes: Uint8Array; mimeType: "image/png" | "image/jpeg"; extension: "png" | "jpg" };

export function parseImageDataUrl(value: unknown, maxBytes = 3_500_000): ParsedImage | null {
  if (typeof value !== "string") return null;
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length > Math.ceil(maxBytes / 3) * 4 + 4) return null;
  let binary: string; try { binary = atob(match[2]); } catch { return null; }
  if (!binary.length || binary.length > maxBytes) return null;
  const bytes = new Uint8Array(binary.length); for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  if (match[1] === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (!signature.every((byte, index) => bytes[index] === byte)) return null;
    return { bytes, mimeType: "image/png", extension: "png" };
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) return null;
  return { bytes, mimeType: "image/jpeg", extension: "jpg" };
}

export function bytesToDataUrl(bytes: Uint8Array, mimeType: "image/png" | "image/jpeg") {
  let binary = ""; const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  return `data:${mimeType};base64,${btoa(binary)}`;
}
