/** Marks an open inline editor, so Escape cancels the edit instead of closing its panel. */
export const INLINE_EDITOR = 'data-inline-editor';

/**
 * For a sheet's or dialog's `onEscapeKeyDown`: Radix catches Escape before the editor sees it,
 * so a panel holding inline editors keeps itself open while one has focus.
 */
export function keepOpenWhileEditing(event: KeyboardEvent): void {
  if (document.activeElement?.closest(`[${INLINE_EDITOR}]`)) event.preventDefault();
}
