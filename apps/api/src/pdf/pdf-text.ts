import { extractText, getDocumentProxy } from 'unpdf';

/** The largest PDF read for a bill: a few pages of text, with room for embedded images. */
export const MAX_PDF_PAGES = 10;

/**
 * The text of a PDF, pages joined. Empty for a scanned PDF that is only images, which has to be
 * photographed instead. The bytes are copied, since PDF.js takes ownership of what it is given.
 */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  const doc = await getDocumentProxy(new Uint8Array(bytes));
  try {
    if (doc.numPages > MAX_PDF_PAGES) return '';
    const { text } = await extractText(doc, { mergePages: true });
    return text.replace(/[ \t]+/g, ' ').trim();
  } finally {
    await doc.cleanup();
  }
}

/** Whether the bytes are a PDF: they start with `%PDF-`. */
export function isPdf(bytes: Uint8Array): boolean {
  return String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-';
}
