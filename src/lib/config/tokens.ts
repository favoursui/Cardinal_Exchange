// QMS testnet display metadata. Backend verification still controls executable routes.
export const tokens = ["WQMS", "USDC", "WETH", "WBTC", "USDT"] as const;
export type Token = (typeof tokens)[number];
export const tokenMetadata = {
  WQMS: { chainId: 19480, name: "Wrapped QMS", address: "0x9AA510295aC664A3d5A3182a3eFe959DE2B12c34", decimals: 18 },
  USDC: { chainId: 19480, name: "USD Coin", address: "0xDd4D61DF875cc613E1372c78827a5F4C2741bf11", decimals: 6 },
  WETH: { chainId: 19480, name: "Wrapped Ether", address: "0x43D7c8434A5290a32C8725224870ad6f85132a31", decimals: 18 },
  // ERC-20 name, symbol and decimals checked on QMS testnet via eth_call.
  WBTC: { chainId: 19480, name: "Wrapped Bitcoin", address: "0x5eBfE302200a5b22E182a5C0D10444Fe44b2A678", decimals: 8 },
  USDT: { chainId: 19480, name: "Tether USD", address: "0x5D1386fC130143F92511bC2D18124D3E414ed429", decimals: 6 },
} as const satisfies Record<Token, { chainId: number; name: string; address: `0x${string}`; decimals: number }>;
