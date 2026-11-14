import type { Address, Hex } from 'viem';
export type CadinalDeployment = { chainId:19480; router:Address; factory:Address; routerHash:Hex; factoryHash:Hex };
// Populate only from reviewed public QMS deployment evidence, never API/user input.
// No QWAP fallback; the public Cadinal deployment is not registered yet.
export const CADINAL_LIQUIDITY_DEPLOYMENT: CadinalDeployment | null = null;
