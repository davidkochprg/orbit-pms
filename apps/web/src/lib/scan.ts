/** The link a phone opens to photograph an ID. */
export function scanUrl(origin: string, scanId: string): string {
  return `${origin}/scan/${encodeURIComponent(scanId)}`;
}

/** A phone can't open the desk's localhost; it needs the computer's network address. */
export function isLocalOnly(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '::1' || hostname.startsWith('127.');
}
