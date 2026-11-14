"use client";
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import styles from './settings.module.css';
const Context=createContext<{slippage:string;deadlineMinutes:number;open:()=>void}|null>(null);
export function useTradingSettings(){const value=useContext(Context);if(!value)throw new Error('Trading settings provider missing');return value;}
const validSlippage=(value:string)=>/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(value)&&Number(value)>=0&&Number(value)<=5;
const validDeadline=(value:string)=>/^[1-9][0-9]?$/.test(value)&&Number(value)<=30;
export function TradingSettingsProvider({children}:{children:ReactNode}) {
 const [slippage,setSlippage]=useState('0.5'),[draft,setDraft]=useState('0.5');
 const [deadlineMinutes,setDeadlineMinutes]=useState(2),[deadlineDraft,setDeadlineDraft]=useState('2');
 const [auto,setAuto]=useState(true),[options,setOptions]=useState(false);
 const panel=useRef<HTMLDivElement>(null),trigger=useRef<HTMLElement|null>(null);
 const position=()=>{
  if(!panel.current||!trigger.current)return;
  const rect=trigger.current.getBoundingClientRect(),width=Math.min(320,innerWidth-24);
  panel.current.style.left=`${Math.max(12,Math.min(rect.right-width,innerWidth-width-12))}px`;
  const height=panel.current.offsetHeight||190;
  panel.current.style.top=`${Math.max(12,Math.min(rect.bottom+8,innerHeight-height-12))}px`;
 };
 useEffect(()=>{
  const update=()=>{if(panel.current?.matches(':popover-open'))position();};
  window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
  return()=>{window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);};
 },[]);
 const open=()=>{
  if(panel.current?.matches(':popover-open')){panel.current.hidePopover();return;}
  trigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  setDraft(slippage);setDeadlineDraft(String(deadlineMinutes));setOptions(false);
  panel.current?.showPopover();position();
 };
 const reset=()=>{setSlippage('0.5');setDraft('0.5');setDeadlineMinutes(2);setDeadlineDraft('2');setAuto(true);setOptions(false);};
 return <Context.Provider value={{slippage,deadlineMinutes,open}}>{children}
 <div ref={panel} id="swap-settings" popover="auto" role="dialog" aria-label="Swap settings" className={styles.panel}>
  <div className={styles.row}>
   <label htmlFor="swap-slippage">Max slippage</label><span className={styles.info} tabIndex={0} title="Maximum price movement allowed. Auto uses the default 0.5%; custom values can be 0–5%." aria-label="Slippage help: auto uses 0.5%, custom range 0–5%">i</span>
   <div className={styles.pill}>
    <button type="button" className={styles.auto} aria-pressed={auto} title="Use default slippage: 0.5%" onClick={()=>{setAuto(true);setDraft('0.5');setSlippage('0.5');}}>Auto</button>
    <input id="swap-slippage" inputMode="decimal" value={draft} maxLength={6} aria-invalid={!validSlippage(draft)} onChange={event=>{const value=event.target.value;setDraft(value);setAuto(false);if(validSlippage(value))setSlippage(String(Number(value)));}}/><span>%</span>
   </div>
  </div>
  {!validSlippage(draft)&&<p className={styles.error} role="alert">Enter slippage from 0 to 5%.</p>}
  <div className={styles.row}>
   <label htmlFor="swap-deadline">Swap deadline</label><span className={styles.info} tabIndex={0} title="Starts when the swap is prepared. Default: 2 minutes. Choose 1–30 minutes." aria-label="Deadline help: 1–30 minutes from preparation, default 2 minutes">i</span>
   <div className={`${styles.pill} ${styles.deadline}`}><input id="swap-deadline" inputMode="numeric" value={deadlineDraft} maxLength={2} aria-invalid={!validDeadline(deadlineDraft)} onChange={event=>{const value=event.target.value;setDeadlineDraft(value);if(validDeadline(value))setDeadlineMinutes(Number(value));}}/><span>minutes</span></div>
  </div>
  {!validDeadline(deadlineDraft)&&<p className={styles.error} role="alert">Enter a whole number from 1 to 30.</p>}
  <button type="button" className={`${styles.row} ${styles.options}`} aria-expanded={options} onClick={()=>setOptions(value=>!value)}><span>Trade options</span><span className={styles.optionValue}>{slippage==='0.5'&&deadlineMinutes===2?'Default':'Custom'}<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={options?'m6 15 6-6 6 6':'m9 4 8 8-8 8'}/></svg></span></button>
  {options&&<button type="button" className={styles.reset} onClick={reset}>Reset to defaults</button>}
 </div></Context.Provider>;
}
