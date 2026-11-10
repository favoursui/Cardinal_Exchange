"use client";

import Image from "next/image";
import { useTradingSettings } from "@/features/trading/settings";
import { useBalances, useCapabilities } from "@/features/trading/use-trading-data";
import { ReviewButton } from "@/features/trading/review-button";
import type { Intent } from "@/features/trading/validation";
import { TransactionHistory } from "@/features/history/transaction-history";
import { useWallet, shortAddress } from "@/features/wallet/wallet-provider";
import { useEffect, useId, useRef, useState } from "react";
import { TokenLogo } from "@/components/ui/token-logo";
import { tokens, tokenMetadata, type Token } from "@/lib/config/tokens";
import { baseUnits, displayUnits, displayBalance, useRouteQuote } from "./use-route-quote";
import styles from "./exchange-card.module.css";

type IconName = "history" | "settings" | "refresh" | "switch" | "gas" | "wallet";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    history: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    refresh: <><path d="M3 12a9 9 0 0 1 15.36-6.36L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.36 6.36L3 16" /><path d="M8 16H3v5" /></>,
    switch: <><path d="M8 19V5m-4 4 4-4 4 4M16 5v14m-4-4 4 4 4-4" /></>,
    gas: <><path d="M4 21V4h10v17M3 21h12M4 10h10m0 3h2a2 2 0 0 1 2 2v3a2 2 0 0 0 4 0V9l-4-4m2 2-2 2 4 3" /></>,
    wallet: <><path d="M20 8V4H5a2 2 0 0 0 0 4h16v12H5a2 2 0 0 1-2-2V6m18 6h-6v4h6" /><path d="M17 14h.01" /></>,
    settings: <><path d="m10 3-.6 2.3-2 1-2.2-.6-2 3.5L5 11v2l-1.8 1.8 2 3.5 2.2-.6 2 1L10 21h4l.6-2.3 2-1 2.2.6 2-3.5L19 13v-2l1.8-1.8-2-3.5-2.2.6-2-1L14 3Z" /><circle cx="12" cy="12" r="3" /></>,
  };
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function TokenMark({ token }: { token: Token }) {
  return <TokenLogo symbol={token} className={styles.tokenMark} />;
}

function TokenPicker({ token, label, onChange, balances }: { token: Token; label: string; onChange: (token: Token) => void; balances: Partial<Record<Token, string>> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const [query, setQuery] = useState("");
  const matchingTokens = tokens.filter(value => `${value} ${tokenMetadata[value].name} ${tokenMetadata[value].address}`.toLowerCase().includes(query.trim().toLowerCase()));

  function openPicker() {
    setQuery("");
    dialog.current?.showModal();
    search.current?.focus();
  }

  return (
    <>
      <button ref={trigger} type="button" className={styles.tokenPicker} aria-label={label} aria-haspopup="dialog" onClick={openPicker}>
        <TokenMark token={token} />
        <span>{token}</span>
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <dialog ref={dialog} className={styles.tokenDialog} aria-labelledby={headingId} onClose={() => trigger.current?.focus()} onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.current?.close();
      }}>
        <div className={styles.tokenDialogHeader}>
          <h2 id={headingId}>Select token</h2>
          <button type="button" className={styles.tokenDialogClose} onClick={() => dialog.current?.close()} aria-label="Close token selection">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className={styles.tokenSearchArea}>
          <svg className={styles.tokenSearchIcon} aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
          <input ref={search} className={styles.tokenSearch} aria-label="Search tokens" placeholder="Search name, ticker, or address" value={query} onChange={event => setQuery(event.target.value)} autoComplete="off" spellCheck={false} />
        </div>
        <p className={styles.tokenListHeading}>Listed tokens</p>
        <ul className={styles.tokenList} aria-label="Listed tokens">
          {matchingTokens.map(value => (
            <li key={value}>
              <button type="button" className={styles.tokenOption} aria-pressed={token === value} onClick={() => { onChange(value); dialog.current?.close(); }}>
                <TokenMark token={value} />
                <span className={styles.tokenIdentity}>
                  <span className={styles.tokenName}>{tokenMetadata[value].name}</span>
                  <span className={styles.tokenFullName}>{value}{value !== "QMS" && <span className={styles.tokenAddress} title={tokenMetadata[value].address}> · {shortAddress(tokenMetadata[value].address)}</span>}</span>
                </span>
                <span className={styles.tokenBalance} aria-label={balances[value] === undefined ? "Balance unavailable" : "Token balance"}><span>{balances[value] === undefined ? "—" : displayBalance(balances[value]!, tokenMetadata[value].decimals)}</span><span>—</span></span>
              </button>
            </li>
          ))}
        </ul>
        {matchingTokens.length === 0 && <p className={styles.noTokens} role="status">No tokens found</p>}
      </dialog>
    </>
  );
}

export function ExchangeCard() {
  const wallet = useWallet();
  const balanceState = useBalances(wallet.account);
  const capabilities = useCapabilities();
  const [maxError, setMaxError] = useState("");
  const [gasBudget, setGasBudget] = useState<{key:string;amount:string;approval:boolean}>();
  const [openRoutesKey, setOpenRoutesKey] = useState<string | null>(null);
  const [inputToken, setInputToken] = useState<Token>("QMS");
  const [outputToken, setOutputToken] = useState<Token>("USDC");
  const [amount, setAmount] = useState("");
  const settings = useTradingSettings();
  const slippage = settings.slippage;
  const history = useRef<HTMLDialogElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyButton = useRef<HTMLButtonElement>(null);
  const conversion = inputToken === "QMS" && outputToken === "WQMS" ? "Wrap" : inputToken === "WQMS" && outputToken === "QMS" ? "Unwrap" : null;
  const conversionAmount = /^\d+(?:\.\d{1,18})?$/.test(amount) ? amount : "0.00";

  const route = useRouteQuote(inputToken, outputToken, amount, slippage, !!conversion);
  const routesKey = JSON.stringify([wallet.account, wallet.chainId, route.quotes.map(quote => quote.quoteId)]);
  const routesOpen = route.quotes.length > 0 && openRoutesKey === routesKey;
  const routeName = route.quote?.venueName ?? "Awaiting quote";
  const estimatedOutput = route.quote ? displayUnits(route.quote.amountOut, tokenMetadata[outputToken].decimals) : "0.00";

  const inputBalance = balanceState.balances[inputToken], outputBalance = balanceState.balances[outputToken];
  const amountIn = baseUnits(amount, tokenMetadata[inputToken].decimals);
  const intent: Intent | null = conversion && amountIn ? {kind: conversion === "Wrap" ? "wrap" : "unwrap", amount: amountIn} : route.quote ? {kind: "swap", quote: route.quote} : null;
  const feeKey = JSON.stringify([wallet.account, wallet.chainId, intent]);
  const currentGas = gasBudget?.key === feeKey ? gasBudget : undefined;
  const resetAfterSuccess = (submitted: Intent) => {
    const unchanged = submitted.kind === "swap"
      ? submitted.quote.tokenIn === inputToken && submitted.quote.tokenOut === outputToken && submitted.quote.amountIn === amountIn
      : (submitted.kind === "wrap" || submitted.kind === "unwrap") && conversion?.toLowerCase() === submitted.kind && submitted.amount === amountIn;
    if (unchanged) { setAmount("0.00"); setGasBudget(undefined); setOpenRoutesKey(null); setMaxError(""); }
  };
  const complete = () => { balanceState.refresh(); route.refresh(); };
  const maxContext = useRef("");
  useEffect(() => { maxContext.current = `${wallet.account}:${inputToken}`; }, [wallet.account, inputToken]);
  const fillMax = async () => {
    const context = `${wallet.account}:${inputToken}`;
    setMaxError("");
    if (inputBalance === undefined) return;
    if (inputToken !== "QMS") { setAmount(displayUnits(inputBalance, tokenMetadata[inputToken].decimals)); return; }
    try {
      const price = await wallet.readRpc("eth_gasPrice");
      if (typeof price !== "string" || !/^0x[0-9a-f]+$/i.test(price) || BigInt(price) <= BigInt(0)) throw new Error("Gas price unavailable.");
      const reserve = BigInt(price) * BigInt(2) * BigInt(6_500_000);
      const available = BigInt(inputBalance) - reserve;
      if (available <= BigInt(0)) throw new Error("Balance is too low after reserving QMS for gas.");
      if (maxContext.current === context) setAmount(displayUnits(available.toString(), 18));
    } catch (e) { setMaxError(e instanceof Error ? e.message : "Could not reserve gas."); }
  };

  function chooseToken(side: "input" | "output", token: Token) {
    if (side === "input") {
      if (token === outputToken) setOutputToken(inputToken);
      setInputToken(token);
      setAmount("");
    } else {
      if (token === inputToken) { setInputToken(outputToken); setAmount(""); }
      setOutputToken(token);
    }
  }

  return (
    <section className={styles.card} aria-labelledby="exchange-title">
      <div className={styles.heading}>
        <h1 id="exchange-title">{conversion ?? "Exchange"}</h1>
        <div className={styles.tools}>
          <button ref={historyButton} type="button" className={styles.iconButton} onClick={() => { setHistoryOpen(true); history.current?.showModal(); }} aria-label="Transaction history" aria-haspopup="dialog" title="Transaction history"><Icon name="history" /></button>
          <button type="button" className={styles.iconButton} onClick={() => { setAmount("0.00"); setGasBudget(undefined); setOpenRoutesKey(null); setMaxError(""); }} aria-label="Reset swap amounts" title="Reset amounts"><Icon name="refresh" /></button>
          <button type="button" className={styles.iconButton} disabled={!!conversion} onClick={settings.open} aria-label="Swap settings"><Icon name="settings" /></button>
        </div>
      </div>

      <div className={styles.amountGroup}>
        <div className={styles.amountPanel}>
          <div className={styles.networkRow}><label htmlFor="swap-amount">From</label></div>
          <div className={styles.amountRow}>
            <input id="swap-amount" aria-label={`Amount of ${inputToken} to swap`} value={amount} placeholder="0.00" inputMode="decimal" autoComplete="off" spellCheck={false} maxLength={79} onChange={event => { if (/^\d*(\.\d*)?$/.test(event.target.value)) setAmount(event.target.value); }} />
            <TokenPicker token={inputToken} label="From token" onChange={token => chooseToken("input", token)} balances={balanceState.balances} />
          </div>
          <div className={styles.balanceRow}><span>— USD</span><span>Balance: {inputBalance === undefined ? "—" : displayBalance(inputBalance, tokenMetadata[inputToken].decimals)} <button type="button" disabled={inputBalance === undefined || !wallet.correctNetwork} onClick={() => void fillMax()} title={inputToken === "QMS" ? "Reserve a conservative gas budget" : "Use token balance"}>MAX</button></span></div>
        </div>

        <div className={styles.switchDivider}>
          <button type="button" className={styles.switchButton} aria-label="Reverse token pair" onClick={() => { setInputToken(outputToken); setOutputToken(inputToken); setAmount(""); }}><Icon name="switch" /></button>
        </div>

        <div className={styles.amountPanel}>
          <div className={styles.networkRow}><span>To</span></div>
          <div className={styles.amountRow}>
            <output aria-label="Estimated output amount" className={styles.output}>{conversion ? conversionAmount : estimatedOutput}</output>
            <TokenPicker token={outputToken} label="To token" onChange={token => chooseToken("output", token)} balances={balanceState.balances} />
          </div>
          <div className={styles.balanceRow}><span>— USD</span><span>Balance: {outputBalance === undefined ? "—" : displayBalance(outputBalance, tokenMetadata[outputToken].decimals)}</span></div>
        </div>
        <div className={styles.recipient}><Icon name="wallet" /><span title={wallet.account ?? undefined}>{wallet.account ? shortAddress(wallet.account) : "No wallet connected"}</span></div>
      </div>

      <div className={styles.gasRow}>
        <span className={styles.gasIcon}><Icon name="gas" /></span>
        <div><span>Network fee</span><p>{inputToken === "QMS" ? "Keep some QMS available for gas" : "Paid in native QMS"}</p></div>
        <span className={styles.gasValue}>{currentGas ? `${currentGas.amount} QMS` : "On preparation"}</span>
      </div>

      {conversion ? <div className={styles.routeSection}>
        <div className={styles.routeCard}>
          <div className={styles.routeSummary}><strong>{conversion} {inputToken}</strong><span>1 QMS = 1 WQMS</span></div>
          <p>{conversion === "Wrap" ? "Convert QMS into wrapped QMS for token swaps." : "Convert wrapped QMS back to native QMS."}</p>
          <p>No swap fee or slippage. Network gas still applies.</p>
        </div>
      </div> : <div className={styles.routeSection}>
        <div className={styles.routeHeading}><span>Swap route</span><span className={styles.routeStatus} role="status">{route.status}</span></div>
        <div className={styles.routeCard}>
          {route.quote && route.best && <span className={styles.bestReturnTag}>Best Return</span>}
          <div className={styles.routeSummary}><strong>{route.quote ? routeName : "Find your best route"}</strong><span>{route.quote ? estimatedOutput : "—"} {outputToken}</span></div>
          <div className={styles.routeDetails}><span>{currentGas ? `${currentGas.approval ? "Approval gas budget" : "Gas budget"}: ${currentGas.amount} QMS` : "Gas: calculated on preparation"}</span><span>After swap fees</span></div>
          <p className={styles.routeTiming}>Confirmation: 3 blocks · time varies</p>
          {route.quote && <p>Minimum receive: {displayUnits(route.quote.minimumAmountOut, tokenMetadata[outputToken].decimals)} {outputToken} · Gas paid separately</p>}
          <div className={styles.routePath} aria-label={`${inputToken} through ${routeName} to ${outputToken}`}>
            <span className={styles.routeToken}><TokenMark token={inputToken} />{inputToken}</span>
            <span aria-hidden="true" className={styles.arrow}>⟶</span>
            <span className={styles.routeVenue}>{route.quote?.venue === "qwap" && <Image src="/images/qwap.jpg" alt="" width={18} height={18} className={styles.venueLogo} />}{routeName}</span>
            <span aria-hidden="true" className={styles.arrow}>⟶</span>
            <span className={styles.routeToken}><TokenMark token={outputToken} />{outputToken}</span>
          </div>
        </div>
        <div className={styles.routeFooter}><span>Slippage: {slippage}%</span><button disabled={!route.quotes.length} type="button" aria-expanded={routesOpen} onClick={() => setOpenRoutesKey(routesOpen ? null : routesKey)}>{routesOpen ? "Hide routes" : "See all routes"} <span aria-hidden="true">›</span></button></div>
        {routesOpen && <div className={styles.routeChoices}>{route.quotes.map((quote, index) => <button key={quote.quoteId} type="button" aria-pressed={route.quote?.quoteId === quote.quoteId} onClick={() => { route.select(quote.venue); setOpenRoutesKey(null); }}><span className={styles.routeChoiceIdentity}>{quote.venue === "qwap" && <Image src="/images/qwap.jpg" alt="" width={18} height={18} className={styles.venueLogo} />}<span>{quote.venueName}</span>{index === 0 && <span className={styles.routeChoiceBest}>Best Return</span>}</span><span className={styles.routeChoiceAmount}>{displayUnits(quote.amountOut, tokenMetadata[outputToken].decimals)} {outputToken}</span></button>)}</div>}
      </div>}

      {maxError && <p role="alert">{maxError}</p>}
      {capabilities.error && <p role="alert">{capabilities.error}</p>}
      {capabilities.ready && !capabilities.enabled(conversion ? "nativeWrapping" : "swapPreparation") && <p className={styles.notice}>Preparation is disabled on the API.</p>}
      {inputToken === "QMS" && <p className={styles.notice}>MAX reserves a conservative gas budget. Unused gas stays in your wallet.</p>}
      <ReviewButton inline onSuccess={resetAfterSuccess} onPrepared={(review, preparedIntent) => { const tx = review.transaction; setGasBudget(tx.gas && tx.gasPrice ? {key: JSON.stringify([wallet.account, wallet.chainId, preparedIntent]), amount: displayUnits((BigInt(tx.gas) * BigInt(tx.gasPrice)).toString(), 18), approval: review.approval} : undefined); }} key={`${wallet.account}:${wallet.chainId}`} intent={intent} enabled={capabilities.enabled(conversion ? "nativeWrapping" : "swapPreparation")} label={conversion ? `Review ${conversion.toLowerCase()}` : "Review swap"} onComplete={complete} />

      <dialog ref={history} className={`${styles.settingsDialog} ${styles.historyDialog}`} aria-labelledby="history-title" onClose={() => { setHistoryOpen(false); historyButton.current?.focus(); }} onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) history.current?.close();
      }}>
        <div className={styles.heading}><h2 id="history-title">Transaction history</h2><button className={styles.closeButton} type="button" aria-label="Close transaction history" onClick={() => history.current?.close()}>×</button></div>
        {historyOpen && <TransactionHistory key={`${wallet.account ?? "disconnected"}:${wallet.chainId}`} onConnect={() => { history.current?.close(); setTimeout(wallet.open, 0); }} />}
      </dialog>


    </section>
  );
}
