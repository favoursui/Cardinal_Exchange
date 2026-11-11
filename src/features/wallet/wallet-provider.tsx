"use client";

import { AccountPanel } from './account-panel';
import { WalletSignIn, signOutWallet } from './sign-in';
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { isProvider, QMS_CHAIN_ID, WalletController, type WalletOption, type WalletState } from './controller';
import { saveTransaction } from '@/features/history/store';
import type { WalletTransaction } from './controller';
import { WalletLogo, walletIconSource } from './wallet-logo';
import { qmsWalletChain } from './network';
import styles from './wallet.module.css';

type WalletContextValue = WalletState & { correctNetwork: boolean; open: () => void; disconnect: () => void; verifyTransaction: (hash: string) => Promise<void>; readRpc: WalletController["readRpc"]; sendTransaction: (tx: WalletTransaction) => Promise<{hash: string; historySaved: boolean}> };
const WalletContext = createContext<WalletContextValue | null>(null);
export function shortAddress(address: string) { return `${address.slice(0, 6)}…${address.slice(-4)}`; }
export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error('WalletProvider is required');
  return context;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(() => new WalletController());
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [configError, setConfigError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (state.account) dialog.current?.close();
  }, [state.account]);
  useEffect(() => {
    function announce(event: Event) {
      const detail = (event as CustomEvent).detail;
      if (!detail || !isProvider(detail.provider) || typeof detail.info?.uuid !== 'string' || detail.info.uuid.length > 80 ||
        typeof detail.info?.name !== 'string' || !detail.info.name.trim() || detail.info.name.length > 80) return;
      const option: WalletOption = { id: detail.info.uuid, name: detail.info.name, icon: walletIconSource(detail.info.icon), provider: detail.provider };
      setWallets(current => {
        const entries = current.filter(wallet => wallet.id !== 'legacy');
        if (entries.some(wallet => wallet.id === option.id || wallet.provider === option.provider)) return entries;
        return entries.length < 20 ? [...entries, option] : entries;
      });
    }
    function legacy() {
      const provider = (window as unknown as { ethereum?: unknown }).ethereum;
      if (isProvider(provider)) setWallets(current => current.length ? current : [{ id: 'legacy', name: 'Browser wallet', provider }]);
    }
    window.addEventListener('eip6963:announceProvider', announce);
    window.addEventListener('ethereum#initialized', legacy);
    window.addEventListener('cadinal:discover-wallets', legacy);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    const timer = setTimeout(legacy, 200);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('eip6963:announceProvider', announce);
      window.removeEventListener('ethereum#initialized', legacy);
      window.removeEventListener('cadinal:discover-wallets', legacy);
      controller.disconnect();
    };
  }, [controller]);
  const open = () => {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConfigError(null);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    window.dispatchEvent(new Event('cadinal:discover-wallets'));
    if (!dialog.current?.open) dialog.current?.showModal();
  };
  const switchNetwork = () => {
    try { setConfigError(null); void controller.switchNetwork(qmsWalletChain()); }
    catch { setConfigError('The QMS network configuration is unavailable. Please try again later.'); }
  };
  const sendTransaction = async (tx: WalletTransaction) => {
    const hash = await controller.sendTransaction(tx);
    let historySaved = true;
    try { saveTransaction(localStorage, tx.from, hash); window.dispatchEvent(new Event('cadinal:transaction')); }
    catch { historySaved = false; }
    return {hash, historySaved};
  };
  const previousIdentity=useRef<string|null>(null);
  const identity=state.account?`${state.account.toLowerCase()}:${state.chainId}`:null;
  useEffect(()=>{
    const previous=previousIdentity.current;
    previousIdentity.current=identity;
    if(previous&&previous!==identity)void signOutWallet().catch(()=>setConfigError('Server sign-out failed. Please retry sign-out; the session otherwise expires automatically.'));
  },[identity]);
  const disconnect=controller.disconnect;
  const correctNetwork = state.chainId === QMS_CHAIN_ID;
  return <WalletContext.Provider value={{ ...state, correctNetwork, open, disconnect, verifyTransaction: controller.verifyTransaction, readRpc: controller.readRpc, sendTransaction }}>
    {children}
    <dialog ref={dialog} className={`${styles.dialog} ${state.account ? styles.connectedDialog : styles.connectDialog}`} aria-labelledby="wallet-title" onClose={() => trigger.current?.focus()} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.current?.close();
    }}>
      {!state.account&&<div className={styles.header}><h2 id="wallet-title">Connect a Wallet</h2><button type="button" aria-label="Close wallet dialog" onClick={()=>dialog.current?.close()}>×</button></div>}
      <div className={state.account ? styles.connectedBody : styles.body}>
        {state.account ? <AccountPanel key={state.account} account={state.account} correctNetwork={correctNetwork} busy={state.busy} onDisconnect={disconnect} onClose={()=>dialog.current?.close()} onSwitch={switchNetwork}>
          <WalletSignIn key={`${state.account}:${state.chainId}`} account={state.account} correctNetwork={correctNetwork} controller={controller} walletBusy={state.busy} />
        </AccountPanel> : <>
          <div className={styles.connectLayout}>
            <section className={styles.walletChoices} aria-label="Available wallets">
              <p className={styles.sectionLabel}>Detected wallets</p>
              {wallets.length ? <ul className={styles.list}>{wallets.map(wallet => <li key={wallet.id}><button type="button" disabled={state.busy} onClick={() => { setConfigError(null); void controller.connect(wallet); }}><WalletLogo source={wallet.icon} /><span>{wallet.name}</span></button></li>)}</ul> : <p className={styles.empty}>No compatible wallet detected. Enable an Ethereum-compatible wallet extension, or open Cadinal in your wallet’s built-in browser.</p>}
              {state.busy && <button type="button" className={styles.secondary} onClick={controller.disconnect}>Cancel connection</button>}
            </section>
          </div>
        </>}
        {state.busy && <p role="status">Confirm the request in your wallet.</p>}
        {(state.error || configError) && <p role="alert" className={styles.error}>{configError || state.error}</p>}
      </div>
    </dialog>
  </WalletContext.Provider>;
}
