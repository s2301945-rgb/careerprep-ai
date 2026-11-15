export const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

export function getApiOriginForSmokeCheck() {
  if (!apiBase || !URL.canParse(apiBase)) return undefined;

  const url = new URL(apiBase);
  if ((url.protocol === "http:" || url.protocol === "https:") && apiBase === url.origin) {
    return url.origin;
  }
}
