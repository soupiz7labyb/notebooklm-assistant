export const NOTEBOOKLM_BASE_URL = 'https://notebooklm.google.com';
// 300k tokens ≈ 225k characters (1 token ≈ 0.75 characters on average)
export const CHUNK_SIZE = 225000; // 300k tokens in characters
export const CHUNK_OVERLAP = 1000; // Overlap between chunks
export const QUEUE_DELAY_MS = 1000; // Delay between queue items
