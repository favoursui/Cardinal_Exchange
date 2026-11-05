"use client";

import { useEffect, useState } from "react";
import { tokenMetadata, type Token } from "@/lib/config/tokens";

type RouteQuote = { venue: string; venueName: string; amountOut: string; expiresAt: string };
type Result = { key: string; quote?: RouteQuote; status: string };

export function baseUnits(amount: string, decimals: number): string | null {
  if (!/^\d+(?:\.\d*)?$/.test(amount) || amount.length > 79) return null;
  const [whole, fraction = ""] = amount.split(".");
  if (fraction.length > decimals) return null;
  const value = BigInt(whole + fraction.padEnd(decimals, "0"));
  return value > BigInt(0) && value < BigInt(2) ** BigInt(256) ? value.toString() : null;
}

export function displayUnits(amount: string, decimals: number): string {
  const digits = amount.padStart(decimals + 1, "0");
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return `${digits.slice(0, -decimals)}${fraction ? `.${fraction}` : ""}`;
}

export function useRouteQuote(input: Token, output: Token, amount: string, slippage: string, conversion: boolean) {
  const [result, setResult] = useState<Result>();
  const [revision, setRevision] = useState(0);
  const amountIn = baseUnits(amount, tokenMetadata[input].decimals);
  const slippageBps = Math.round(Number(slippage) * 100);
  const key = JSON.stringify([input, output, amountIn, slippageBps, conversion, revision]);
  const enabled = !conversion && amountIn !== null;
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let expired: ReturnType<typeof setTimeout> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    const debounce = setTimeout(async () => {
      timeout = setTimeout(() => {
        if (active) setResult({ key, status: "Quote unavailable" });
        controller.abort();
      }, 35_000);
      try {
        const base = process.env.NEXT_PUBLIC_API_BASE_URL;
        if (!base) throw new Error("API not configured");
        const response = await fetch(`${base.replace(/\/$/, "")}/v1/quotes`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chainId: 19480, tokenIn: tokenMetadata[input].address, tokenOut: tokenMetadata[output].address, amountIn, slippageBps }),
          signal: controller.signal, cache: "no-store", credentials: "omit",
        });
        if (!response.ok) throw new Error("Quote unavailable");
        const data = await response.json();
        const quote = data?.quotes?.[0];
        if (!quote || quote.chainId !== 19480 || quote.tokenIn?.toLowerCase() !== tokenMetadata[input].address.toLowerCase() ||
          quote.tokenOut?.toLowerCase() !== tokenMetadata[output].address.toLowerCase() || quote.amountIn !== amountIn || quote.slippageBps !== slippageBps ||
          typeof quote.venue !== "string" || !/^[a-z][a-z0-9-]{0,31}$/.test(quote.venue) ||
          typeof quote.venueName !== "string" || !quote.venueName.trim() || quote.venueName.length > 80 ||
          typeof quote.amountOut !== "string" || !/^[1-9][0-9]{0,77}$/.test(quote.amountOut) || BigInt(quote.amountOut) >= BigInt(2) ** BigInt(256) ||
          typeof quote.expiresAt !== "string") throw new Error("Invalid quote");
        const remaining = Date.parse(quote.expiresAt) - Date.now();
        if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 15_000) throw new Error("Expired quote");
        if (!active || controller.signal.aborted) return;
        setResult({ key, quote, status: "Best available · before gas" });
        expired = setTimeout(() => { if (active) setResult({ key, status: "Quote expired — refresh" }); }, remaining);
      } catch {
        if (active && !controller.signal.aborted) setResult({ key, status: "Quote unavailable" });
      } finally { clearTimeout(timeout); }
    }, 400);
    return () => { active = false; controller.abort(); clearTimeout(debounce); clearTimeout(timeout); clearTimeout(expired); };
  }, [key, enabled, input, output, amountIn, slippageBps]);
  const current = enabled && result?.key === key ? result : undefined;
  return { quote: current?.quote, status: !enabled ? "Awaiting quote" : current?.status ?? "Finding route…", refresh: () => setRevision(value => value + 1), enabled };
}
