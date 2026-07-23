export const NEW_PICTURE_PASSWORD_LENGTH = 3;
export const LEGACY_PICTURE_PASSWORD_LENGTH = 4;

export function shouldOfferLegacyPicturePassword(input: { status: number; mode: string; hasPersonalQrToken: boolean; legacyMode: boolean; submittedLength: number }) {
  return input.status === 401
    && (input.mode === "unlock" || input.mode === "recover")
    && !input.hasPersonalQrToken
    && !input.legacyMode
    && input.submittedLength === NEW_PICTURE_PASSWORD_LENGTH;
}

export function picturePasswordLength(value: unknown) {
  if (!Array.isArray(value) || (value.length !== NEW_PICTURE_PASSWORD_LENGTH && value.length !== LEGACY_PICTURE_PASSWORD_LENGTH)) return 0;
  const pictures = value.map(String);
  if (pictures.some((picture) => !picture || picture.includes("→"))) return 0;
  return pictures.length;
}

export function normalizePicturePassword(value: unknown) {
  return picturePasswordLength(value) ? (value as unknown[]).map(String).join("→") : "";
}
