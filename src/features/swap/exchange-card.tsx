"use client";

import { useWallet, shortAddress } from "@/features/wallet/wallet-provider";
import { useId, useRef, useState } from "react";
import { TokenLogo } from "@/components/ui/token-logo";
import { tokens, tokenMetadata, type Token } from "@/lib/config/tokens";
import { displayUnits, useRouteQuote } from "./use-route-quote";
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

function TokenPicker({ token, label, onChange }: { token: Token; label: string; onChange: (token: Token) => void }) {
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
          <h2 id={headingId}>Select a token</h2>
          <button type="button" className={styles.tokenDialogClose} onClick={() => dialog.current?.close()} aria-label="Close token selection">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className={styles.tokenSearchArea}>
          <input ref={search} className={styles.tokenSearch} aria-label="Search tokens" placeholder="Search Token" value={query} onChange={event => setQuery(event.target.value)} autoComplete="off" spellCheck={false} />
        </div>
        <ul className={styles.tokenList} aria-label="Available tokens">
          {matchingTokens.map(value => (
            <li key={value}>
              <button type="button" className={styles.tokenOption} aria-pressed={token === value} onClick={() => { onChange(value); dialog.current?.close(); }}>
                <TokenMark token={value} />
                <span className={styles.tokenIdentity}><span>{value}</span><span className={styles.tokenFullName}>{tokenMetadata[value].name}</span></span>
                <span className={styles.tokenBalance} aria-label="Balance unavailable until wallet is connected"><span>—</span><span>Balance</span></span>
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
  const [inputToken, setInputToken] = useState<Token>("QMS");
  const [outputToken, setOutputToken] = useState<Token>("USDC");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [draftSlippage, setDraftSlippage] = useState("0.5");
  const validSlippage = /^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(draftSlippage) && Number(draftSlippage) >= 0 && Number(draftSlippage) <= 5;
  const settings = useRef<HTMLDialogElement>(null);
  const history = useRef<HTMLDialogElement>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  const conversion = inputToken === "QMS" && outputToken === "WQMS" ? "Wrap" : inputToken === "WQMS" && outputToken === "QMS" ? "Unwrap" : null;
  const conversionAmount = /^\d+(?:\.\d{1,18})?$/.test(amount) ? amount : "0.00";

  const route = useRouteQuote(inputToken, outputToken, amount, slippage, !!conversion);
  const routeName = route.quote?.venueName ?? "Awaiting quote";
  const estimatedOutput = route.quote ? displayUnits(route.quote.amountOut, tokenMetadata[outputToken].decimals) : "0.00";

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
          <button ref={historyButton} type="button" className={styles.iconButton} onClick={() => history.current?.showModal()} aria-label="Transaction history" aria-haspopup="dialog" title="Transaction history"><Icon name="history" /></button>
          <button type="button" className={styles.iconButton} disabled={!route.enabled} onClick={route.refresh} aria-label="Refresh quote" title="Refresh quote"><Icon name="refresh" /></button>
          <button type="button" className={styles.iconButton} disabled={!!conversion} onClick={() => { setDraftSlippage(slippage); settings.current?.showModal(); }} aria-label="Swap settings"><Icon name="settings" /></button>
        </div>
      </div>

      <div className={styles.amountGroup}>
        <div className={styles.amountPanel}>
          <div className={styles.networkRow}><label htmlFor="swap-amount">From</label></div>
          <div className={styles.amountRow}>
            <input id="swap-amount" aria-label={`Amount of ${inputToken} to swap`} value={amount} placeholder="0.00" inputMode="decimal" autoComplete="off" spellCheck={false} maxLength={79} onChange={event => { if (/^\d*(\.\d*)?$/.test(event.target.value)) setAmount(event.target.value); }} />
            <TokenPicker token={inputToken} label="From token" onChange={token => chooseToken("input", token)} />
          </div>
          <div className={styles.balanceRow}><span>— USD</span><span>Balance: — <button type="button" disabled title="Connect a wallet to use your balance">MAX</button></span></div>
        </div>

        <div className={styles.switchDivider}>
          <button type="button" className={styles.switchButton} aria-label="Reverse token pair" onClick={() => { setInputToken(outputToken); setOutputToken(inputToken); setAmount(""); }}><Icon name="switch" /></button>
        </div>

        <div className={styles.amountPanel}>
          <div className={styles.networkRow}><span>To</span></div>
          <div className={styles.amountRow}>
            <output aria-label="Estimated output amount" className={styles.output}>{conversion ? conversionAmount : estimatedOutput}</output>
            <TokenPicker token={outputToken} label="To token" onChange={token => chooseToken("output", token)} />
          </div>
          <div className={styles.balanceRow}><span>— USD</span><span>Balance: —</span></div>
        </div>
        <div className={styles.recipient}><Icon name="wallet" /><span title={wallet.account ?? undefined}>{wallet.account ? shortAddress(wallet.account) : "No wallet connected"}</span></div>
      </div>

      <div className={styles.gasRow}>
        <span className={styles.gasIcon}><Icon name="gas" /></span>
        <div><span>Network fee</span><p>{inputToken === "QMS" ? "Keep some QMS available for gas" : "Paid in native QMS"}</p></div>
        <span className={styles.gasValue}>—</span>
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
          {route.quote && <span className={styles.bestReturnTag}>Best Return</span>}
          <div className={styles.routeSummary}><strong>{route.quote ? routeName : "Find your best route"}</strong><span>{route.quote ? estimatedOutput : "—"} {outputToken}</span></div>
          <p>Compare available exchanges before you swap.</p>
          <div className={styles.routePath} aria-label={`${inputToken} through ${routeName} to ${outputToken}`}>
            <span className={styles.routeToken}><TokenMark token={inputToken} />{inputToken}</span>
            <span aria-hidden="true" className={styles.arrow}>⟶</span>
            <span className={styles.routeVenue}>{routeName}</span>
            <span aria-hidden="true" className={styles.arrow}>⟶</span>
            <span className={styles.routeToken}><TokenMark token={outputToken} />{outputToken}</span>
          </div>
        </div>
        <div className={styles.routeFooter}><span>Slippage: {slippage}%</span><button disabled type="button">See all routes <span aria-hidden="true">›</span></button></div>
      </div>}

      <button type="button" disabled={!!wallet.account && wallet.correctNetwork && !wallet.busy} className={styles.submit} onClick={wallet.open} title={wallet.account && wallet.correctNetwork ? "Transaction submission is not connected yet" : "Open wallet connection"}>{wallet.busy ? "Check your wallet" : !wallet.account ? "Connect wallet" : !wallet.correctNetwork ? "Switch to QMS Testnet" : "Swapping coming soon"}</button>

      <dialog ref={history} className={styles.settingsDialog} aria-labelledby="history-title" onClose={() => historyButton.current?.focus()} onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) history.current?.close();
      }}>
        <div className={styles.heading}><h2 id="history-title">Transaction history</h2><button className={styles.closeButton} type="button" aria-label="Close transaction history" onClick={() => history.current?.close()}>×</button></div>
        <p>Transaction history will be available when swaps are enabled.</p>
      </dialog>

      <dialog ref={settings} className={styles.settingsDialog} aria-labelledby="settings-title" onClick={event => { if (event.target === event.currentTarget) settings.current?.close(); }}>
        <div className={styles.heading}><h2 id="settings-title">Swap settings</h2><button className={styles.closeButton} type="button" aria-label="Close settings" onClick={() => settings.current?.close()}>×</button></div>
        <fieldset><legend>Slippage tolerance</legend><p>Your swap will revert if the price changes beyond this limit.</p><div className={styles.slippageOptions}>{["0.1", "0.5", "1"].map(value => <button type="button" key={value} aria-pressed={validSlippage && Number(draftSlippage) === Number(value)} onClick={() => setDraftSlippage(value)}>{value}%</button>)}</div>
          <label className={styles.customSlippageLabel} htmlFor="custom-slippage">Custom tolerance</label>
          <div className={styles.customSlippageField}>
            <input id="custom-slippage" inputMode="decimal" autoComplete="off" spellCheck={false} maxLength={8} value={draftSlippage} onChange={event => setDraftSlippage(event.target.value)} aria-invalid={!validSlippage} aria-describedby="slippage-help" />
            <span aria-hidden="true">%</span>
          </div>
          <p id="slippage-help" className={validSlippage ? styles.slippageHint : styles.slippageError} aria-live="polite">{validSlippage ? "Allowed range: 0–5%, with up to 2 decimal places." : "Enter a value from 0 to 5 with up to 2 decimal places."}</p>
        </fieldset>
        <button type="button" className={styles.saveButton} disabled={!validSlippage} onClick={() => { if (validSlippage) { setSlippage(String(Number(draftSlippage))); settings.current?.close(); } }}>Done</button>
      </dialog>
    </section>
  );
}
