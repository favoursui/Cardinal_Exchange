"use client";

import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@/features/wallet/wallet-provider';
import { qmsWalletChain } from '@/features/wallet/network';
import { isTransactionHash, parseStatus, readHistory, saveTransaction, statusLabels, type HistoryRecord, type TransactionStatus } from './store';
import styles from './history.module.css';

type Check = { data?: TransactionStatus; unavailable?: boolean };

export function TransactionHistory({ onConnect }: { onConnect: () => void }) {
  const wallet = useWallet();
  const account = wallet.account;
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState('');
  const [adding, setAdding] = useState(false);
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const alive = useRef(false);
  const busy = useRef(false);
  useEffect(() => {
    alive.current = true;
    const load = () => {
      try { setRecords(account ? readHistory(localStorage, account) : []); }
      catch { setError('Saved history could not be read. Check browser storage permissions.'); }
      setLoaded(true);
    };
    const timer = setTimeout(load, 0);
    window.addEventListener('storage', load);
    window.addEventListener('cardinal:transaction', load);
    return () => { alive.current = false; clearTimeout(timer); window.removeEventListener('storage', load); window.removeEventListener('cardinal:transaction', load); };
  }, [account]);
  useEffect(() => {
    if (!account || !records.length) return;
    let cancelled = false, index = 0;
    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController | undefined;
    const poll = async () => {
      if (cancelled) return;
      if (document.visibilityState === 'hidden') { timer = setTimeout(poll, 5_000); return; }
      const record = records[index++ % records.length];
      request = new AbortController();
      const timeout = setTimeout(() => request?.abort(), 20_000);
      try {
        const base = process.env.NEXT_PUBLIC_API_BASE_URL;
        if (!base) throw new Error('API not configured');
        const response = await fetch(`${base.replace(/\/$/, '')}/v1/transactions/${record.hash}`, { signal: request.signal, credentials: 'omit', cache: 'no-store' });
        if (!response.ok) throw new Error('Status unavailable');
        const data = parseStatus(await response.json(), record.hash);
        if (!cancelled) setChecks(current => ({...current, [record.hash]: {data}}));
      } catch {
        if (!cancelled) setChecks(current => ({...current, [record.hash]: {data: current[record.hash]?.data, unavailable: true}}));
      } finally {
        clearTimeout(timeout);
        // Sequential polling stays below the API's 20 requests/minute limit.
        if (!cancelled) timer = setTimeout(poll, 5_000);
      }
    };
    timer = setTimeout(poll, 0);
    return () => { cancelled = true; clearTimeout(timer); request?.abort(); };
  }, [account, records]);
  const track = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!account || busy.current || !wallet.correctNetwork || !isTransactionHash(hash.trim())) return;
    const candidate = hash.trim();
    busy.current = true; setAdding(true); setError(null);
    try {
      await wallet.verifyTransaction(candidate);
      if (!alive.current) return;
      setRecords(saveTransaction(localStorage, account, candidate));
      setHash('');
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : 'Could not track this transaction.');
    } finally { busy.current = false; if (alive.current) setAdding(false); }
  };
  if (!account) return <div className={styles.empty}><p>Connect your wallet to view its tracked transactions.</p><button type="button" onClick={onConnect}>Connect wallet</button></div>;
  let explorer: string | undefined;
  try { explorer = qmsWalletChain().blockExplorerUrls[0].replace(/\/$/, ''); } catch { /* Do not create links from invalid configuration. */ }
  return <div className={styles.content}>
    <p className={styles.hint}>QMS Testnet · Saved in this browser for this wallet. This is not your wallet’s complete transaction history.</p>
    {!wallet.correctNetwork && <p className={styles.hint}>Switch to QMS Testnet in your wallet to add a transaction.</p>}
    <form onSubmit={track} className={styles.form}>
      <label htmlFor="history-hash">Track an existing transaction</label>
      <div><input id="history-hash" placeholder="0x transaction hash" value={hash} maxLength={66} onChange={event => setHash(event.target.value)} autoComplete="off" spellCheck={false} disabled={adding} />
        <button type="submit" disabled={adding || !wallet.correctNetwork || !isTransactionHash(hash.trim())}>{adding ? 'Checking…' : 'Track'}</button></div>
    </form>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!loaded ? <p role="status">Loading history…</p> : !records.length ? <p className={styles.empty}>No tracked transactions yet.</p> : <ul className={styles.list}>
      {records.map(record => {
        const check = checks[record.hash];
        return <li key={record.hash}>
          <div className={styles.row}><strong>Transaction</strong><span className={styles.status} data-status={check?.unavailable ? 'unavailable' : check?.data?.status}>{check?.unavailable ? 'Status unavailable' : check?.data ? statusLabels[check.data.status] : 'Checking status…'}</span></div>
          {explorer ? <a href={`${explorer}/tx/${record.hash}`} target="_blank" rel="noopener noreferrer" title={record.hash}>{record.hash.slice(0, 10)}…{record.hash.slice(-8)} ↗</a> : <span>{record.hash.slice(0, 10)}…{record.hash.slice(-8)}</span>}
          <p className={styles.detail}>Added {new Date(record.addedAt).toLocaleString()}</p>
          {check?.data && !check.unavailable && <p className={styles.detail}>{check.data.confirmations} confirmations · Checked {new Date(check.data.observedAt).toLocaleTimeString()}</p>}
          {check?.data?.status === 'not_found' && !check.unavailable && <p className={styles.detail}>Not visible to the API yet. This does not mean it failed.</p>}
        </li>;
      })}
    </ul>}
    <p className={styles.hint}>Keeps the latest 20 tracked hashes. Status updates while this panel is open. Clearing browser data removes saved history.</p>
  </div>;
}
