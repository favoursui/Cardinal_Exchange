"use client";
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {AccountIdenticon} from '@/components/ui/account-identicon';
import styles from './wallet.module.css';

function Icon({name}:{name:'copy'|'disconnect'|'check'}) {
 const paths={check:<path d="m5 12 4 4L19 6"/>,copy:<><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M15 8V5H5v10h3"/></>,disconnect:<><path d="M14 5V3H4v18h10v-2M10 12h11m-4-4 4 4-4 4"/></>};
 return <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
export function AccountPanel({account,correctNetwork,busy,onDisconnect,onClose,onSwitch,children}:{account:string;correctNetwork:boolean;busy:boolean;onDisconnect:()=>void;onClose:()=>void;onSwitch:()=>void;children:ReactNode}) {
 const [copied,setCopied]=useState(false),[copyError,setCopyError]=useState('');
 const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 const copy=async()=>{try{await navigator.clipboard.writeText(account);setCopied(true);setCopyError('');clearTimeout(timer.current);timer.current=setTimeout(()=>setCopied(false),2000);}catch{setCopyError('Could not copy. Select and copy the address below.');}};
 return <div className={styles.accountPanel}>
  <button type="button" className={styles.accountClose} aria-label="Close wallet panel" onClick={onClose}>×</button>
  <div className={styles.accountTop}>
   <div className={styles.accountAvatar}><AccountIdenticon address={account}/></div>
  </div>
  <div className={styles.accountHeading}><h2 id="wallet-title" title={account}>{account.slice(0,5)}…{account.slice(-4)}</h2></div>
  <div className={styles.accountActions}>
   <button type="button" onClick={()=>void copy()}><Icon name={copied?"check":"copy"}/><span>{copied?'Copied!':'Copy Address'}</span></button>
   <button type="button" onClick={()=>{onDisconnect();onClose();}}><Icon name="disconnect"/><span>Disconnect</span></button>
  </div>
  {!correctNetwork&&<button type="button" className={styles.primary} disabled={busy} onClick={onSwitch}>Switch to QMS Testnet</button>}
  <span className={styles.copyAnnouncement} role="status">{copied?'Address copied':''}</span>
  {copyError&&<div role="alert" className={styles.copyError}>{copyError}<code>{account}</code></div>}
  <div className={styles.accountAuth}>{children}</div>
 </div>;
}
