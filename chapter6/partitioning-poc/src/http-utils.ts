import type { IncomingMessage, ServerResponse } from 'node:http';

/** Reads and parses a JSON request body with a safe default for empty bodies. */
export async function readJsonBody<T = Record<string, unknown>>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

/** Sends a JSON response with CORS headers so local demos and curl work cleanly. */
export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

/** Calls a JSON HTTP endpoint with timing measurement and timeout safety. */
export async function fetchJson<T = unknown>(
  url: string,
  options?: { method?: string; body?: unknown; timeoutMs?: number },
): Promise<{ status: number; data: T; elapsedMs: number }> {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options?.timeoutMs ?? 5000);
  try {
    const res = await fetch(url, {
      method: options?.method ?? 'GET',
      headers: options?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    const data = text ? (JSON.parse(text) as T) : ({} as T);
    return { status: res.status, data, elapsedMs: Number((performance.now() - started).toFixed(2)) };
  } finally {
    clearTimeout(timer);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
