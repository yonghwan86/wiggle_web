export const NEW_PICTURE_PASSWORD_LENGTH = 3;
export const LEGACY_PICTURE_PASSWORD_LENGTH = 4;

export function picturePasswordLength(value: unknown) {
  if (!Array.isArray(value) || (value.length !== NEW_PICTURE_PASSWORD_LENGTH && value.length !== LEGACY_PICTURE_PASSWORD_LENGTH)) return 0;
  const pictures = value.map(String);
  if (pictures.some((picture) => !picture || picture.includes("→"))) return 0;
  return pictures.length;
}

export function normalizePicturePassword(value: unknown) {
  return picturePasswordLength(value) ? (value as unknown[]).map(String).join("→") : "";
}
