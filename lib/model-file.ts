import { MAX_FILE_SIZE } from './catalog';
import type { FileErrorKey } from './copy';

export type SupportedFormat = 'stl' | 'obj' | '3mf';

export function getFormat(fileName: string): SupportedFormat | null {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension === 'stl' || extension === 'obj' || extension === '3mf' ? extension : null;
}

export function validateModelFile(file: File): FileErrorKey | null {
  if (!getFormat(file.name)) return 'unsupported';
  if (file.size > MAX_FILE_SIZE) return 'tooLarge';
  return null;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatNumber(value: number, digits = 1) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value);
}

/**
 * Dates in the page's language but always with Latin digits (2026/11/08, not ٢٠٢٦/١١/٠٨).
 * `-u-nu-latn` keeps Arabic month names while forcing Western numerals.
 */
export function formatDate(value: string | Date, language: 'ar' | 'en' = 'ar', withTime = false) {
  return new Date(value).toLocaleString(language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
}
