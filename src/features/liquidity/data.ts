import { getAddress, zeroAddress, type Address } from 'viem';
import { object, uint } from '@/features/trading/api';
import { same } from '@/features/trading/validation';
import { tokenMetadata, tokens, type Token } from '@/lib/config/tokens';
import { CADINAL_LIQUIDITY_DEPLOYMENT, type CadinalDeployment } from '@/lib/config/cadinal-deployment';
import { FACTORY, ROUTER } from '@/features/trading/contracts';

export type LiquidityPool = {
  address: Address; tokenA: Token; tokenB: Token; reserveA: string; reserveB: string;
  totalSupply: string; lpBalance: string | null; amountA: string | null; amountB: string | null;
  shareBps: string | null; feeBps: number; observedAt: string;
};
function ensure(valid: unknown): asserts valid { if (!valid) throw new Error('Pool data could not be verified. Please try again.'); }
const address = (value: unknown) => { ensure(typeof value === 'string'); const result = getAddress(value as string); ensure(result !== zeroAddress); return result; };
const knownToken = (raw: unknown): Token => {
  const token = object(raw);
  const symbol = tokens.find(t => t !== 'QMS' && same(token.address, tokenMetadata[t].address));
  ensure(symbol && token.symbol === symbol && token.decimals === tokenMetadata[symbol].decimals);
  return symbol!;
};
export function parseLiquidityPool(raw: unknown, wallet: string | null, deployment: CadinalDeployment | null = CADINAL_LIQUIDITY_DEPLOYMENT): LiquidityPool {
  const data = object(raw);
  ensure(deployment && deployment.chainId === 19480 && !same(deployment.router, ROUTER) && !same(deployment.factory, FACTORY));
  ensure(data.chainId === 19480 && data.venue === 'cadinal' && same(data.router, deployment!.router) && same(data.factory, deployment!.factory));
  const tokenA = knownToken(data.token0), tokenB = knownToken(data.token1);
  ensure(tokenA !== tokenB && data.poolFeeBps === 30);
  const reserveA = uint(data.reserve0), reserveB = uint(data.reserve1), supply = uint(data.totalSupply);
  ensure(reserveA < BigInt(2) ** BigInt(112) && reserveB < BigInt(2) ** BigInt(112));
  ensure(supply > BigInt(0) || (reserveA === BigInt(0) && reserveB === BigInt(0)));
  const observedAt = typeof data.observedAt === 'string' ? data.observedAt : '';
  const time = Date.parse(observedAt); ensure(Number.isFinite(time) && time <= Date.now() + 15000 && time >= Date.now() - 120000);
  let lpBalance: string | null = null, amountA: string | null = null, amountB: string | null = null, shareBps: string | null = null;
  if (wallet) {
    const position = object(data.position);
    ensure(same(position.wallet, wallet));
    const balance = uint(position.lpBalance); ensure(balance <= supply);
    const estimate = (reserve: bigint) => supply ? balance * reserve / supply : BigInt(0);
    ensure(uint(position.estimatedAmount0) === estimate(reserveA) && uint(position.estimatedAmount1) === estimate(reserveB));
    ensure(uint(position.shareBps) === (supply ? balance * BigInt(10000) / supply : BigInt(0)));
    lpBalance = balance.toString(); amountA = estimate(reserveA).toString(); amountB = estimate(reserveB).toString(); shareBps = String(position.shareBps);
  } else ensure(data.position === null);
  return {address: address(data.pool), tokenA, tokenB, reserveA: reserveA.toString(), reserveB: reserveB.toString(), totalSupply: supply.toString(), lpBalance, amountA, amountB, shareBps, feeBps:30, observedAt};
}
export function parseCatalog(raw: unknown, wallet: string | null, cursor: number, deployment: CadinalDeployment | null = CADINAL_LIQUIDITY_DEPLOYMENT) {
  const data = object(raw);
  ensure(data.chainId === 19480 && data.venue === 'cadinal' && typeof data.configured === 'boolean' && Array.isArray(data.pools) && data.pools.length <= 6);
  ensure(Array.isArray(data.failures) && typeof data.partial === 'boolean' && data.partial === (data.failures.length > 0));
  const maxPairs = (tokens.length - 1) * (tokens.length - 2) / 2;
  ensure(Number.isInteger(data.totalPairs) && Number(data.totalPairs) >= 0 && Number(data.totalPairs) <= maxPairs);
  ensure(Number.isInteger(data.checkedPairs) && Number(data.checkedPairs) >= 0 && Number(data.checkedPairs) <= 6);
  ensure(data.nextCursor === null || (Number.isInteger(data.nextCursor) && Number(data.nextCursor) === cursor + Number(data.checkedPairs) && Number(data.nextCursor) > cursor && Number(data.nextCursor) < Number(data.totalPairs)));
  ensure(data.pools.length + data.failures.length <= Number(data.checkedPairs));
  if (data.configured && data.nextCursor === null) ensure(cursor + Number(data.checkedPairs) === Number(data.totalPairs));
  if (!data.configured) ensure(data.pools.length === 0 && data.failures.length === 0 && data.nextCursor === null && data.totalPairs === 0 && data.checkedPairs === 0);
  if (data.configured && !deployment) throw new Error('Cadinal pools are not available in this app yet.');
  return {configured: data.configured, pools: data.pools.map(pool => parseLiquidityPool(pool, wallet, deployment)), partial: data.partial, nextCursor: data.nextCursor as number | null, totalPairs: Number(data.totalPairs)};
}
