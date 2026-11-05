import { parseAbi, type Address, type Hex } from 'viem';
export const ROUTER: Address = '0x93AFF45f28e5DF1b55f5AEFEfB807De843b12619';
export const FACTORY: Address = '0x93AFD9aC50822F82c7C4f2Ec8Ec2463b086Fb878';
export const WQMS: Address = '0x9AA510295aC664A3d5A3182a3eFe959DE2B12c34';
export const NATIVE: Address = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
export const abi = parseAbi([
 'function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) returns (uint256[])',
 'function swapExactETHForTokens(uint256,address[],address,uint256) payable returns (uint256[])',
 'function swapExactTokensForETH(uint256,uint256,address[],address,uint256) returns (uint256[])',
 'function addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256) returns (uint256,uint256,uint256)',
 'function removeLiquidity(address,address,uint256,uint256,uint256,address,uint256) returns (uint256,uint256)',
 'function deposit() payable', 'function withdraw(uint256)', 'function approve(address,uint256) returns (bool)',
 'function getPair(address,address) view returns (address)', 'function balanceOf(address) view returns (uint256)',
 'function allowance(address,address) view returns (uint256)',
]);
// Copied from the backend's verified testnet registry. No arbitrary router approvals.
export const codeHashes: Record<string, Hex> = {
 [ROUTER.toLowerCase()]: '0x73072957ed723c68ced357f23c146995405d722c80f8c0410e8cd333a263e083',
 [FACTORY.toLowerCase()]: '0x224c23047e89f999c9f99c70c9646c999756adae084f95f8f9767bdf7f1e1f5d',
 [WQMS.toLowerCase()]: '0x202001f48dc337a326d9a0a92e6e610a4f965257b38bf6e6edcd84aa9706c4e6',
 '0xdd4d61df875cc613e1372c78827a5f4c2741bf11': '0xe99aaea4db88aa9d18971c706ee57aa91099d04dcb126f16f3ca9f8a96fc44b5',
 '0x43d7c8434a5290a32c8725224870ad6f85132a31': '0xf65bf38c6b28cc34a99a88a4a62763c6811aa0750e99d6eb829e79cf913dc830',
 '0x5ebfe302200a5b22e182a5c0d10444fe44b2a678': '0xf059c9f7db9f0f1556ae43cac1ce28ca45ba07170e0fad052a0d3b5253ff8c03',
 '0x5d1386fc130143f92511bc2d18124d3e414ed429': '0x4a6af5d3e4f58b8b52a8f60157fcc64440c0b4856b89d195b60190a768dffe15',
};
