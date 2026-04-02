// DOCX buffer store — shared between upload and download routes
// Stores raw docx buffers and parsed ASTs for v2 pipeline

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const store = new Map<string, { buffer: Buffer; ast: any; timestamp: number }>();

// Clean up old entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of store) {
    if (now - val.timestamp > 30 * 60 * 1000) store.delete(key);
  }
}, 30 * 60 * 1000);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function storeDocxBuffer(jobId: string, buffer: Buffer, ast: any): void {
  store.set(jobId, { buffer, ast, timestamp: Date.now() });
}

export function getDocxBuffer(jobId: string): { buffer: Buffer; ast: unknown } | undefined {
  const entry = store.get(jobId);
  if (entry) {
    entry.timestamp = Date.now();
    return { buffer: entry.buffer, ast: entry.ast };
  }
  return undefined;
}

export function deleteDocxBuffer(jobId: string): void {
  store.delete(jobId);
}
