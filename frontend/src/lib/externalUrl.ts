/** 외부 페이지 링크로 사용할 수 있는 절대 HTTP(S) URL만 반환한다. */
export function toSafeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}
