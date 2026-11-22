import type { LiquidityPool } from "@/features/liquidity/data";
import type { Token } from "@/lib/config/tokens";

const stable = (token: Token) => token === "USDC" || token === "USDT";
type Rate = { numerator: bigint; denominator: bigint; depth: bigint };

// Rates convert raw token units into micro-USD. Both stablecoins use six decimals.
export function estimateUsd(token: Token, amount: string, pools: readonly LiquidityPool[]): bigint | null {
  const raw = BigInt(amount);
  if (!raw || stable(token)) return raw;
  function rate(asset: Token): Rate | undefined {
    let best: Rate | undefined;
    for (const pool of pools) {
      if (Date.now() - Date.parse(pool.observedAt) > 120000) continue;
      const first = pool.tokenA === asset;
      if (!first && pool.tokenB !== asset) continue;
      const base = first ? pool.tokenB : pool.tokenA;
      const units = BigInt(first ? pool.reserveA : pool.reserveB);
      const backing = BigInt(first ? pool.reserveB : pool.reserveA);
      if (!units || !backing) continue;
      let candidate: Rate;
      if (stable(base)) {
        candidate = { numerator: backing, denominator: units, depth: backing };
      } else if (base === "WQMS" && asset !== "WQMS") {
        const anchor = rate("WQMS");
        if (!anchor) continue;
        const numerator = backing * anchor.numerator;
        const value = numerator / anchor.denominator;
        candidate = { numerator, denominator: units * anchor.denominator, depth: value < anchor.depth ? value : anchor.depth };
      } else continue;
      if (!best || candidate.depth > best.depth) best = candidate;
    }
    return best;
  }
  const price = rate(token === "QMS" ? "WQMS" : token);
  return price ? raw * price.numerator / price.denominator : null;
}

export function usdLabel(value: bigint | null, positive: boolean) {
  if (value === null) return "— USD";
  if (positive && value < BigInt(10000)) return "<0.01 USD";
  const cents = (value + BigInt(5000)) / BigInt(10000);
  return (cents / BigInt(100)).toLocaleString("en-US") + "." + String(cents % BigInt(100)).padStart(2, "0") + " USD";
}
