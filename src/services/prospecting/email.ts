const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i

export function extractPublicEmail(html: string): string | null {
  const normalized = html
    .replace(/&#(?:64|x40);|&commat;|%40/gi, '@')
    .replace(/&#(?:46|x2e);|&period;|%2e/gi, '.')
  return normalized.match(emailPattern)?.[0].toLowerCase() ?? null
}
