"use client";
import { useEffect, useState } from 'react';
import { api } from '@/features/trading/api';
import { parseCatalog, type LiquidityPool } from './data';

type Catalog = { key: string; configured: boolean; pools: LiquidityPool[]; partial: boolean; error?: string };
export function useLiquidity(wallet: string | null) {
  const [revision,setRevision] = useState(0);
  const [state,setState] = useState<Catalog>();
  const key = JSON.stringify([wallet,revision]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let inFlight = false;
    const load = async () => {
      if (controller.signal.aborted || inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const pools: LiquidityPool[] = [];
        let cursor: number | null = 0, partial = false, configured = false, total: number | undefined;
        do {
          const query = new URLSearchParams({cursor:String(cursor),...(wallet ? {wallet} : {})});
          const page = parseCatalog(await api(`/v1/liquidity/pools?${query}`,undefined,controller.signal), wallet, cursor);
          if (controller.signal.aborted) return;
          if (total !== undefined && total !== page.totalPairs) throw new Error('Pool list changed. Please refresh.');
          total = page.totalPairs; configured = page.configured; partial ||= page.partial;
          for (const pool of page.pools) {
            if (pools.some(p => p.address.toLowerCase() === pool.address.toLowerCase())) throw new Error('Duplicate pool data. Please refresh.');
            pools.push(pool);
          }
          cursor = page.nextCursor;
        } while (cursor !== null);
        setState({key,configured,pools,partial});
      } catch (error) {
        if (!controller.signal.aborted) setState({key,configured:false,pools:[],partial:true,error:error instanceof Error ? error.message : 'Pools could not be loaded.'});
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) timer = setTimeout(() => void load(),60000);
      }
    };
    const visibility = () => {
      clearTimeout(timer);
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange',visibility);
    void load();
    return () => {controller.abort();clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);};
  },[key,wallet]);
  return {state:state?.key === key ? state : undefined, refresh:() => setRevision(n => n+1)};
}
