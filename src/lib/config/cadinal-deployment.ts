import type { Address, Hex } from 'viem';
export type CadinalDeployment = { chainId:19480; router:Address; factory:Address; routerHash:Hex; factoryHash:Hex };
// Populate only from reviewed public QMS deployment evidence, never API/user input.
// Verified QMS testnet factory/router; no QWAP fallback.
export const CADINAL_LIQUIDITY_DEPLOYMENT: CadinalDeployment | null = {
 chainId:19480,
 factory:'0x0EBd9c9523fBD5F4DaCC7c46EC56E7e4A215792a',
 router:'0xFa4eaa0C403E55d70aba03fc9c0066732Aff3d33',
 factoryHash:'0xbab145d02e7005f0d84c6c1639d39b799b0ea16df99ebbdaf5a14d9da820b4e0',
 routerHash:'0x178cbadccd90eeb8185aef8caab924eb3d6e1890b22dd03bef7b1c07aa1c2620',
};
