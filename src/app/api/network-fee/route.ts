import { qmsWalletChain } from '@/features/wallet/network';

export const dynamic = 'force-dynamic';
let cached: { gasPrice: string; expires: number } | undefined;
let pending: Promise<string> | undefined;

async function fetchGasPrice(): Promise<string> {
  const chain = qmsWalletChain();
  const signal = AbortSignal.timeout(8000);
  const read = async (method: string, id: number) => {
    const response = await fetch(chain.rpcUrls[0], {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params: [] }),
      signal, cache: 'no-store', redirect: 'error',
    });
    if (!response.ok) throw new Error('RPC unavailable');
    const data = await response.json();
    if (data.error || data.id !== id || typeof data.result !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(data.result)) throw new Error('Invalid RPC response');
    return BigInt(data.result);
  };
  const [chainId, price] = await Promise.all([read('eth_chainId', 1), read('eth_gasPrice', 2)]);
  if (chainId !== BigInt(chain.chainId) || price <= BigInt(0)) throw new Error('Invalid network fee');
  return price.toString();
}

export async function GET() {
  try {
    if (!cached || cached.expires <= Date.now()) {
      pending ??= fetchGasPrice().then(gasPrice => {
        cached = { gasPrice, expires: Date.now() + 30_000 };
        return gasPrice;
      }).finally(() => { pending = undefined; });
      await pending;
    }
    return Response.json({ gasPrice: cached!.gasPrice }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'NETWORK_FEE_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
