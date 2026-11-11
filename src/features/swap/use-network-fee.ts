"use client";
import { useEffect, useState } from 'react';
import { displayUnits } from './use-route-quote';

// Live gas price in Gwei. Display only; never used for transaction validation.
export function useNetworkGasPrice() {
  const [gasPrice, setGasPrice] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight || controller.signal.aborted || document.visibilityState === 'hidden') return;
      inFlight = true;
      clearTimeout(timer);
      try {
        const response = await fetch('/api/network-fee', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) });
        if (!response.ok) throw new Error('Fee unavailable');
        const data = await response.json();
        if (typeof data.gasPrice !== 'string' || !/^[1-9][0-9]{0,77}$/.test(data.gasPrice)) throw new Error('Invalid fee');
        if (!controller.signal.aborted) setGasPrice(displayUnits(data.gasPrice, 9));
      } catch {
        if (!controller.signal.aborted) setGasPrice(undefined);
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) timer = setTimeout(() => void refresh(), 30_000);
      }
    };
    const visibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', visibility);
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  return gasPrice;
}
