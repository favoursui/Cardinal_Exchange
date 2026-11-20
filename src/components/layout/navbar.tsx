"use client";

import { ThemeToggle } from "./theme-toggle";
import { useWallet, shortAddress } from "@/features/wallet/wallet-provider";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { AccountIdenticon } from "@/components/ui/account-identicon";
import { TokenLogo } from "@/components/ui/token-logo";

function Chevron() {
  return <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function Navbar() {
  const wallet = useWallet();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const navigation = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const tradeTrigger = useRef<HTMLButtonElement>(null);
  const tradeMenu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen && !tradeOpen) return;
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!tradeMenu.current?.contains(event.target)) setTradeOpen(false);
      if (!navigation.current?.contains(event.target)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (tradeOpen) {
        setTradeOpen(false);
        tradeTrigger.current?.focus();
      } else {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    const desktop = window.matchMedia("(min-width: 801px)");
    const resize = () => { setTradeOpen(false); setMenuOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    desktop.addEventListener("change", resize);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      desktop.removeEventListener("change", resize);
    };
  }, [menuOpen, tradeOpen]);
  return (
    <header className="exchange-header">
      <nav ref={navigation} aria-label="Main navigation" className="exchange-nav">
        <Link href="/" aria-label="Cadinal Exchange home" className="brand" onClick={() => setMenuOpen(false)}>
          <span className="brand-mark"><Image src="/images/cadinal.svg" alt="" width={34} height={34} /></span>
          <span className="brand-name">Cadinal</span>
          {pathname === "/analytics" && <span className="brand-section">Analytics</span>}
        </Link>

        <div id="primary-navigation-links" className="nav-links" data-open={menuOpen}>
          <div
            ref={tradeMenu}
            className="trade-menu"
            onPointerEnter={event => {
              if (event.pointerType === "mouse" && window.matchMedia("(min-width: 801px)").matches) setTradeOpen(true);
            }}
            onPointerLeave={event => {
              if (event.pointerType === "mouse" && !event.currentTarget.contains(document.activeElement)) setTradeOpen(false);
            }}
            onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setTradeOpen(false); }}
          >
            <button ref={tradeTrigger} type="button" className="trade-trigger" aria-expanded={tradeOpen}
              aria-controls="trade-options" onClick={() => setTradeOpen(open => !open)}>
              Trade <Chevron />
            </button>
            <div id="trade-options" className="trade-options" hidden={!tradeOpen}>
              <Link href="/" aria-current={pathname === "/" ? "page" : undefined} onClick={() => { setMenuOpen(false); setTradeOpen(false); }}>Swap <span aria-hidden="true">↗</span></Link>
              <Link href="/liquidity" aria-current={pathname === "/liquidity" ? "page" : undefined} onClick={() => { setMenuOpen(false); setTradeOpen(false); }}>Liquidity <span aria-hidden="true">↗</span></Link>
            </div>
          </div>
          <button className="nav-link" disabled title="Coming soon">Profile</button>
        </div>

        <div className="nav-actions">
          <span className="network-pill" title="QMS testnet">
            <TokenLogo symbol="QMS" className="network-mark" />
          </span>
          <ThemeToggle />
          <button ref={menuButton} type="button" className="mobile-menu-button" aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={menuOpen} aria-controls="primary-navigation-links" onClick={() => { setTradeOpen(false); setMenuOpen(open => !open); }}>
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d={menuOpen ? "m6 6 12 12M6 18 18 6" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </button>
        </div>
      </nav>
      <button type="button" className="wallet-button header-wallet" onClick={() => { setMenuOpen(false); wallet.open(); }} aria-haspopup="dialog" title={wallet.account ?? "Connect wallet"}>
        {wallet.account ? <AccountIdenticon address={wallet.account} /> : (<svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 8V5a2 2 0 0 0-2-2L5 6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h15V8H5a2 2 0 0 1 0-4" /><path d="M20 12h-5v5h5" /><path d="M17 14.5h.01" /></svg>)}
        <span>{wallet.account ? shortAddress(wallet.account) : wallet.busy ? "Connecting…" : "Connect wallet"}</span>
        <Chevron />
      </button>
    </header>
  );
}
