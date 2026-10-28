/** Long edge of an ID photo sent for reading: enough for small print, a few hundred KB. */
export const ID_PHOTO_MAX_EDGE = 1600;

/** Scales a width and height down to fit `maxEdge` on the longer side, never up. */
export function fitWithin(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Re-encodes a camera photo as a downscaled JPEG in the browser, so the upload is small and any
 * format the camera produced (HEIC on iPhones) arrives as something the model reads.
 */
export async function prepareIdPhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, ID_PHOTO_MAX_EDGE);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not read the photo'))),
      'image/jpeg',
      0.85,
    ),
  );
}
