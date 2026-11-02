/** Whether a platform string (navigator.platform or the user agent) is an Apple device. */
export function isApplePlatform(platform: string): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

const platform =
  typeof navigator === 'undefined' ? '' : navigator.platform || navigator.userAgent || '';

/** Shortcuts use ⌘ on Apple devices and Ctrl everywhere else. */
export const isApple = isApplePlatform(platform);

/** The shortcut modifier's label: "⌘" on a Mac, "Ctrl" on Windows and Linux. */
export const modKey = isApple ? '⌘' : 'Ctrl';

/** A shortcut with the modifier, as shown on a key cap: "⌘K" on a Mac, "Ctrl K" elsewhere. */
export function modShortcut(key: string, apple = isApple): string {
  return apple ? `⌘${key}` : `Ctrl ${key}`;
}
