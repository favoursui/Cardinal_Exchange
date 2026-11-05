"use client";

import { useWallet, shortAddress } from "@/features/wallet/wallet-provider";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TokenLogo } from "@/components/ui/token-logo";

function Chevron() {
  return <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function CardinalMark() {
  return (
    <svg aria-hidden="true" width="34" height="34" viewBox="0 0 36 36" fill="none">
      <circle cx="18" cy="18" r="17" fill="currentColor" />
      <path d="m10 27 2-11 5-4 2-7 4 7 5 4-6 2-2 9-4-6-6 6Z" fill="#111214" />
      <circle cx="21" cy="14" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function Navbar() {
  const wallet = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigation = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !navigation.current?.contains(event.target)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); }
    };
    const desktop = window.matchMedia("(min-width: 801px)");
    const resize = () => { if (desktop.matches) setMenuOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    desktop.addEventListener("change", resize);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      desktop.removeEventListener("change", resize);
    };
  }, [menuOpen]);
  return (
    <header className="exchange-header">
      <nav ref={navigation} aria-label="Main navigation" className="exchange-nav">
        <Link href="/" aria-label="Cardinal Exchange home" className="brand" onClick={() => setMenuOpen(false)}>
          <span className="brand-mark"><CardinalMark /></span>
          <span className="brand-name">Cardinal</span>
        </Link>

        <div id="primary-navigation-links" className="nav-links" data-open={menuOpen}>
          <details className="trade-menu">
            <summary className="trade-trigger">Trade <Chevron /></summary>
            <div className="trade-options">
              <Link href="/" aria-current="page" onClick={() => setMenuOpen(false)}>Swap <span aria-hidden="true">↗</span></Link>
              <button disabled>Liquidity <span className="soon-label">Soon</span></button>
            </div>
          </details>
          <button className="nav-link" disabled title="Coming soon">Cardinal AI</button>
          <button className="nav-link" disabled title="Coming soon">Profile</button>
        </div>

        <div className="nav-actions">
          <span className="network-pill" title="QMS testnet">
            <TokenLogo symbol="QMS" className="network-mark" />
          </span>
          <button className="settings-button" disabled aria-label="Settings (coming soon)" title="Coming soon">
            <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9.5 3-.6 2.3-1.8 1-2.3-.6-2 3.5 1.7 1.7v2.2l-1.7 1.7 2 3.5 2.3-.6 1.8 1 .6 2.3h4.9l.6-2.3 1.8-1 2.3.6 2-3.5-1.7-1.7v-2.2l1.7-1.7-2-3.5-2.3.6-1.8-1-.6-2.3Z" />
              <circle cx="12" cy="12" r="3.2" />
            </svg>
          </button>
          <button type="button" className="wallet-button" onClick={() => { setMenuOpen(false); wallet.open(); }} aria-haspopup="dialog" title={wallet.account ?? "Connect wallet"}>
            <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 8V5a2 2 0 0 0-2-2L5 6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h15V8H5a2 2 0 0 1 0-4" /><path d="M20 12h-5v5h5" /><path d="M17 14.5h.01" /></svg>
            <span>{wallet.busy ? "Connecting…" : wallet.account ? shortAddress(wallet.account) : "Connect wallet"}</span>
            <Chevron />
          </button>
          <button ref={menuButton} type="button" className="mobile-menu-button" aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={menuOpen} aria-controls="primary-navigation-links" onClick={() => setMenuOpen(open => !open)}>
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d={menuOpen ? "m6 6 12 12M6 18 18 6" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </button>
        </div>
      </nav>
    </header>
  );
}
