/**
 * Download utility for triggering file downloads from Blobs
 */

/**
 * Trigger a file download from a Blob
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  // Cleanup after a short delay
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(link);
  }, 100);
}

/**
 * Download text content as a file
 */
export function downloadText(content: string, filename: string, mimeType = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  downloadBlob(blob, filename);
}

/**
 * Download a Uint8Array as a file
 */
export function downloadBinary(data: ArrayBuffer, filename: string, mimeType: string): void {
  const blob = new Blob([data], { type: mimeType });
  downloadBlob(blob, filename);
}

/**
 * Sanitize a filename (remove special chars, limit length)
 */
export function sanitizeFilename(name: string, maxLength = 100): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, maxLength) || 'export';
}

/**
 * Get timestamp string for filenames
 */
export function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').substring(0, 19);
}
