import { QMS_CHAIN_ID, type ChainParameters } from './controller';

// Browser-visible public endpoints only. Never use the backend's private RPC credentials.
export function qmsWalletChain(): ChainParameters {
  const rpc = process.env.NEXT_PUBLIC_QMS_RPC_URL || 'https://rpc.testnet.qms.finance';
  const explorer = process.env.NEXT_PUBLIC_QMS_EXPLORER_URL || 'https://testnet.qmsscan.io';
  for (const value of [rpc, explorer]) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Invalid public network configuration');
  }
  return { chainId: QMS_CHAIN_ID, chainName: 'QMS Testnet', nativeCurrency: { name: 'QMS', symbol: 'QMS', decimals: 18 }, rpcUrls: [rpc], blockExplorerUrls: [explorer] };
}
