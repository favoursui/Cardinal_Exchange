export const HISTORY_CHAIN_ID = 19480;
export const MAX_RECORDS = 20;
export const isTransactionHash = (value: unknown): value is string => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
export type HistoryRecord = { hash: string; addedAt: string };
export interface HistoryStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
function key(account: string) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(account)) throw new Error('Invalid account');
  return `cardinal:transactions:v1:${HISTORY_CHAIN_ID}:${account.toLowerCase()}`;
}
export function readHistory(storage: HistoryStorage, account: string): HistoryRecord[] {
  const raw = storage.getItem(key(account));
  if (!raw) return [];
  if (raw.length > 20_000) throw new Error('Invalid saved history');
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error('Invalid saved history');
  const seen = new Set<string>();
  return value.filter((record): record is HistoryRecord => {
    if (!record || typeof record !== 'object' || !isTransactionHash(record.hash) || typeof record.addedAt !== 'string' || !Number.isFinite(Date.parse(record.addedAt))) return false;
    const hash = record.hash.toLowerCase();
    if (seen.has(hash)) return false;
    seen.add(hash); return true;
  }).slice(0, MAX_RECORDS).map(record => ({hash: record.hash.toLowerCase(), addedAt: record.addedAt}));
}
// Call only after a wallet returns a submitted hash, or after verifying an imported hash's sender.
export function saveTransaction(storage: HistoryStorage, account: string, hash: string, now = Date.now()): HistoryRecord[] {
  if (!isTransactionHash(hash)) throw new Error('Invalid transaction hash');
  const records = readHistory(storage, account);
  const normalized = hash.toLowerCase();
  if (records.some(record => record.hash === normalized)) return records;
  const next = [{hash: normalized, addedAt: new Date(now).toISOString()}, ...records].slice(0, MAX_RECORDS);
  storage.setItem(key(account), JSON.stringify(next));
  return next;
}
export const statusLabels = { pending: 'Pending', not_found: 'Not found yet', confirming: 'Confirming', confirmed: 'Confirmed', reverted: 'Reverted', reorged: 'Reorg detected' } as const;
export type TransactionStatus = { status: keyof typeof statusLabels; confirmations: string; requiredConfirmations: string; observedAt: string };
export function parseStatus(value: unknown, hash: string): TransactionStatus {
  if (!value || typeof value !== 'object') throw new Error('Invalid transaction status');
  const data = value as Record<string, unknown>;
  if (!isTransactionHash(data.hash) || data.hash.toLowerCase() !== hash.toLowerCase() || data.chainId !== HISTORY_CHAIN_ID ||
    typeof data.status !== 'string' || !Object.hasOwn(statusLabels, data.status) ||
    typeof data.confirmations !== 'string' || !/^\d{1,30}$/.test(data.confirmations) ||
    typeof data.requiredConfirmations !== 'string' || !/^[1-9]\d{0,29}$/.test(data.requiredConfirmations) ||
    typeof data.observedAt !== 'string' || !Number.isFinite(Date.parse(data.observedAt))) throw new Error('Invalid transaction status');
  return { status: data.status as TransactionStatus['status'], confirmations: data.confirmations, requiredConfirmations: data.requiredConfirmations, observedAt: data.observedAt };
}
