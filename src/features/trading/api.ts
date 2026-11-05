export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid API response.');
  return value as Record<string, unknown>;
}
export function text(value: unknown): string { if (typeof value !== 'string') throw new Error('Invalid API response.'); return value; }
export function uint(value: unknown): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(value) || BigInt(value) >= BigInt(2) ** BigInt(256)) throw new Error('Invalid amount.');
  return BigInt(value);
}
export async function api(path: string, body?: unknown, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) throw new Error('API is not configured. Set NEXT_PUBLIC_API_BASE_URL.');
  const timeout = AbortSignal.timeout(35_000);
  const response = await fetch(`${base.replace(/\/$/, '')}${path}`, { method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined ? {} : {headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)}),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout, credentials: 'omit', cache: 'no-store' });
  const data = object(await response.json());
  if (!response.ok) {
    const code = typeof data.error === 'string' && /^[A-Z_]{1,80}$/.test(data.error) ? data.error.toLowerCase().replaceAll('_', ' ') : 'request unavailable';
    throw new Error(`API: ${code}. Please refresh and try again.`);
  }
  return data;
}
