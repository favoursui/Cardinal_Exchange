"use client";

import Image from "next/image";
import { useState } from "react";

const tokenImages = {
  QMS: "/tokens/qms.webp",
  WQMS: "/tokens/wqms.png",
  USDC: "/tokens/usdc.webp",
  USDT: "/tokens/usdt.png",
  WETH: "/tokens/weth.png",
  WBTC: "/tokens/wbtc.png",
} as const;

// Presentation assets only; this map does not authorize tokens for trading.
export function TokenLogo({ symbol, className }: { symbol: keyof typeof tokenImages; className?: string }) {
  const source = tokenImages[symbol];
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return (
    <span aria-hidden="true" className={className} style={{ overflow: "hidden", borderRadius: "50%" }}>
      {failedSource === source ? symbol.slice(0, 1) : (
        <Image src={source} alt="" width={36} height={36} sizes="36px" style={{ width: "100%", height: "100%", objectFit: "contain" }} onError={() => setFailedSource(source)} />
      )}
    </span>
  );
}
