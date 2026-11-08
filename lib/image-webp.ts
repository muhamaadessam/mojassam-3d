'use client';

/** Longest side of a stored image. Big enough for zooming on a phone, small enough to load fast. */
export const MAX_IMAGE_SIDE = 2000;
const QUALITY = 0.82;

async function decode(file: Blob) {
  try {
    // Respects the photo's EXIF rotation, so phone pictures are not saved sideways.
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/**
 * Shrinks any image the browser can open to at most MAX_IMAGE_SIDE and re-encodes it as WebP.
 * Safari cannot encode WebP from a canvas, so it falls back to a WebAssembly encoder there.
 */
export async function toWebp(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error('Not an image');
  const source = await decode(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height);
  if ('close' in source) source.close();

  let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', QUALITY));
  if (!blob || blob.type !== 'image/webp') {
    const { default: encode } = await import('@jsquash/webp/encode');
    blob = new Blob([await encode(context.getImageData(0, 0, width, height), { quality: QUALITY * 100 })], { type: 'image/webp' });
  }
  const base = file.name.replace(/\.[^.]+$/, '') || 'image';
  return new File([blob], `${base}.webp`, { type: 'image/webp' });
}
