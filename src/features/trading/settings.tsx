"use client";
import {createContext,useContext,useRef,useState,type ReactNode} from 'react';
import styles from './trading.module.css';
const Context=createContext<{slippage:string;open:()=>void}|null>(null);
export function useTradingSettings(){const value=useContext(Context);if(!value)throw new Error('Trading settings provider missing');return value;}
export function TradingSettingsProvider({children}:{children:ReactNode}) {
 const [slippage,setSlippage]=useState('0.5'),[draft,setDraft]=useState('0.5');const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLElement|null>(null);
 const valid=/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(draft)&&Number(draft)>=0&&Number(draft)<=5;
 const open=()=>{trigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setDraft(slippage);dialog.current?.showModal();};
 return <Context.Provider value={{slippage,open}}>{children}<dialog ref={dialog} className={styles.dialog} aria-labelledby="trading-settings-title" onClose={()=>trigger.current?.focus()}>
 <div className={styles.heading}><h2 id="trading-settings-title">Trading settings</h2><button type="button" aria-label="Close settings" onClick={()=>dialog.current?.close()}>×</button></div>
 <p>Your swap will revert if the price changes beyond this limit.</p>
 <div className={styles.tabs}>{['0.1','0.5','1'].map(value=><button key={value} type="button" aria-pressed={valid&&Number(draft)===Number(value)} onClick={()=>setDraft(value)}>{value}%</button>)}</div>
 <label className={styles.field}>Custom slippage tolerance (%)<input inputMode="decimal" value={draft} maxLength={6} onChange={event=>setDraft(event.target.value)} aria-invalid={!valid}/></label>
 <p className={valid?styles.hint:styles.error}>{valid?'Allowed range: 0–5%, with up to two decimal places.':'Enter a value from 0 to 5 with up to two decimal places.'}</p>
 <button type="button" className={styles.primary} disabled={!valid} onClick={()=>{if(valid){setSlippage(String(Number(draft)));dialog.current?.close();}}}>Done</button>
 </dialog></Context.Provider>;
}
