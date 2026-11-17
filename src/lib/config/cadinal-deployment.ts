import type { Address, Hex } from 'viem';
export type CadinalDeployment = { chainId:19480; router:Address; factory:Address; routerHash:Hex; factoryHash:Hex };
// Populate only from reviewed public QMS deployment evidence, never API/user input.
// Source-verified Cadinal factory/router and funded WQMS/USDC pool on QMS testnet; no QWAP fallback.
export const CADINAL_LIQUIDITY_DEPLOYMENT: CadinalDeployment | null = {
 chainId:19480,
 factory:'0xeb79d4CDC34E2f18ab5B9652D2e876F8E47595fF',
 router:'0xb6530355d0F8c18D41B29443bC0defF3bE7E65f2',
 factoryHash:'0x5fad43fd93b2fa69bcfbaade36a9efad3aa62d24cdf038b1288f34542a3a449f',
 routerHash:'0x8b94e21281d5bece77c6d8849a08535553fd598871747dfcfdb8fa1e1304d046',
};
