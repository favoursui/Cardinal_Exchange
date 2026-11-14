import { CADINAL_LIQUIDITY_DEPLOYMENT } from '@/lib/config/cadinal-deployment';
import { ROUTER, FACTORY, codeHashes } from './contracts';
export type LiquidityVenue = 'cadinal' | 'qwap';
export function liquidityContracts(venue: LiquidityVenue) {
  if (venue === 'qwap') return { router: ROUTER, factory: FACTORY, hashes: codeHashes };
  const deployment = CADINAL_LIQUIDITY_DEPLOYMENT;
  if (!deployment || deployment.chainId !== 19480 || deployment.router.toLowerCase() === ROUTER.toLowerCase() || deployment.factory.toLowerCase() === FACTORY.toLowerCase()) throw new Error('Cadinal liquidity is not available yet.');
  const hashes = { ...codeHashes };
  delete hashes[ROUTER.toLowerCase()]; delete hashes[FACTORY.toLowerCase()];
  hashes[deployment.router.toLowerCase()] = deployment.routerHash;
  hashes[deployment.factory.toLowerCase()] = deployment.factoryHash;
  return { router: deployment.router, factory: deployment.factory, hashes };
}
