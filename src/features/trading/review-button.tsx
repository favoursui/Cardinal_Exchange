"use client";
import {useEffect,useRef,useState} from 'react';
import {decodeFunctionResult,encodeFunctionData,keccak256,type Hex} from 'viem';
import {useWallet} from '@/features/wallet/wallet-provider';
import {qmsWalletChain} from '@/features/wallet/network';
import {api} from './api';
import {parseStatus,statusLabels,type TransactionStatus} from '@/features/history/store';
import {abi,codeHashes,FACTORY} from './contracts';
import {addr,requestFor,same,validatePreparation,type Intent,type Review} from './validation';
import styles from './trading.module.css';

async function verifyContracts(intent:Intent,read:ReturnType<typeof useWallet>['readRpc']) {
 const addresses=intent.kind==='swap'?intent.quote.path:intent.kind==='wrap'||intent.kind==='unwrap'?[]:[];
 // Validate all pinned contract runtimes, including the router/factory, before preparation.
 await Promise.all(Object.entries(codeHashes).map(async ([address,expected])=>{
  const code=await read('eth_getCode',[address,'latest']);
  if(typeof code!=='string'||!/^0x(?:[0-9a-fA-F]{2})+$/.test(code)||keccak256(code as Hex)!==expected)throw new Error('Contract identity check failed.');
 }));
 if(addresses.some(address=>!codeHashes[address.toLowerCase()]))throw new Error('Unverified route token.');
 if(intent.kind==='add'||intent.kind==='remove') {
  const {tokenMetadata}=await import('@/lib/config/tokens');
  const data=encodeFunctionData({abi,functionName:'getPair',args:[addr(tokenMetadata[intent.tokenA].address),addr(tokenMetadata[intent.tokenB].address)]});
  const result=await read('eth_call',[{to:FACTORY,data},'latest']);
  const pool=decodeFunctionResult({abi,functionName:'getPair',data:result as Hex});
  if(!same(pool,intent.pool))throw new Error('Pool address does not match the verified factory.');
 }
}

export function ReviewButton({intent,enabled,label,onComplete}:{intent:Intent|null;enabled:boolean;label:string;onComplete:()=>void}) {
 const wallet=useWallet();const dialog=useRef<HTMLDialogElement>(null);const trigger=useRef<HTMLButtonElement>(null);
 const [review,setReview]=useState<Review>();const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [result,setResult]=useState<{hash:string;historySaved:boolean}>();
 const [status,setStatus]=useState<TransactionStatus['status']>();
 const [statusError,setStatusError]=useState(false);
 const completed=useRef(onComplete);
 useEffect(()=>{completed.current=onComplete;},[onComplete]);
 const [now,setNow]=useState(0);const locked=useRef(false);const alive=useRef(true);const request=useRef<AbortController|null>(null);
 const captured=useRef<{intent:Intent;account:string}|undefined>(undefined);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;request.current?.abort();};},[]);
 useEffect(()=>{if(!review)return;const t=setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(t);},[review]);
 useEffect(()=>{
  if(!result)return;
  const c=new AbortController();let timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{
   if(document.visibilityState==='hidden'){timer=setTimeout(poll,10_000);return;}
   try {const data=parseStatus(await api(`/v1/transactions/${result.hash}`,undefined,c.signal),result.hash);if(c.signal.aborted)return;setStatus(data.status);setStatusError(false);
    if(data.status==='confirmed'||data.status==='reverted'){completed.current();return;}
   } catch {if(c.signal.aborted)return;setStatusError(true);}
   if(!c.signal.aborted)timer=setTimeout(poll,10_000);
  };
  void poll();return()=>{c.abort();clearTimeout(timer);};
 },[result]);
 const prepare=async()=>{
  if(!wallet.account||!wallet.correctNetwork){wallet.open();return;}
  if(result && status!=='confirmed' && status!=='reverted'){dialog.current?.showModal();return;}
  if(!intent||locked.current)return;
  locked.current=true;setBusy(true);setError('');setReview(undefined);setResult(undefined);setStatus(undefined);setStatusError(false);
  captured.current={intent,account:wallet.account};const current=captured.current;
  dialog.current?.showModal(); request.current=new AbortController();
  try {
   await verifyContracts(current.intent,wallet.readRpc);
   const requestData=requestFor(current.intent,current.account);
   const data=await api(requestData.path,requestData.body,request.current.signal);
   const next=validatePreparation(data,current.intent,current.account);
   if(alive.current){setReview(next);setNow(Date.now());}
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Preparation failed.');}
  finally{locked.current=false;if(alive.current)setBusy(false);}
 };
 const confirm=async()=>{
  if(!review||locked.current||!captured.current)return;
  if(!same(wallet.account,captured.current.account)||!wallet.correctNetwork){setError('Wallet changed. Prepare again.');return;}
  locked.current=true;setBusy(true);setError('');
  try {const sent=await wallet.sendTransaction(review.transaction);if(alive.current){setResult(sent);onComplete();}}
  catch(e){if(alive.current)setError(e instanceof Error?e.message:'Wallet request failed.');}
  finally{locked.current=false;if(alive.current)setBusy(false);}
 };
 let explorer:string|undefined;try{explorer=qmsWalletChain().blockExplorerUrls[0].replace(/\/$/,'');}catch{}
 const expired=review && now>=review.transaction.expiresAt;
 return <>
  <button ref={trigger} type="button" className={styles.primary} disabled={busy || (!result&&!!wallet.account&&wallet.correctNetwork&&(!enabled||!intent))} onClick={()=>void prepare()}>{wallet.busy?'Check your wallet':!wallet.account?'Connect wallet':!wallet.correctNetwork?'Switch to QMS Testnet':result&&status!=='confirmed'&&status!=='reverted'?'View pending transaction':label}</button>
  <dialog ref={dialog} className={styles.dialog} aria-labelledby="transaction-review-title" onCancel={event=>{if(busy)event.preventDefault();}} onClose={()=>trigger.current?.focus()}>
   <div className={styles.heading}><h2 id="transaction-review-title">{result?(status==='confirmed'?'Transaction confirmed':status==='reverted'?'Transaction reverted':'Transaction submitted'):review?.title??'Prepare transaction'}</h2><button type="button" disabled={busy} aria-label="Close transaction review" onClick={()=>dialog.current?.close()}>×</button></div>
   {busy&&<p role="status">{review?'Check your wallet to confirm.':'Checking contracts and preparing transaction…'}</p>}
   {error&&<p role="alert" className={styles.error}>{error}</p>}
   {result?<>
    <p role="status">{statusError?'Status unavailable — check the explorer before continuing.':status?statusLabels[status]:'Checking confirmation…'}</p>
    <p>{review?.approval?(status==='confirmed'?'Approval confirmed. Close this panel and prepare again to continue.':'Waiting for approval confirmation before the next step.'):'Your transaction is also saved in History.'}</p>
    <p className={styles.hash}>{explorer?<a href={`${explorer}/tx/${result.hash}`} target="_blank" rel="noopener noreferrer">{result.hash} ↗</a>:result.hash}</p>
    {!result.historySaved&&<p role="alert">Browser history could not be saved. Keep the hash above.</p>}
    <button type="button" className={styles.primary} onClick={()=>dialog.current?.close()}>Done</button>
   </>:<>
    {review&&<><ul className={styles.reviewLines}>{review.lines.map(line=><li key={line}>{line}</li>)}</ul><p className={styles.hash}>Wallet: {review.transaction.from}</p><p className={styles.hint}>QMS Testnet · Review the amount and recipient in your wallet.</p>
    {expired?<p role="status">Review expired. Prepare again for current amounts.</p>:<p className={styles.hint}>Review valid for {Math.max(0,Math.ceil((review.transaction.expiresAt-now)/1000))} seconds.</p>}
    <button type="button" className={styles.primary} disabled={busy||expired||!same(wallet.account,review.transaction.from)||!wallet.correctNetwork} onClick={()=>void confirm()}>{review.approval?'Confirm approval in wallet':'Confirm in wallet'}</button></>}
    {(!review||expired||error)&&!busy&&<button type="button" className={styles.secondary} onClick={()=>void prepare()}>Prepare again</button>}
   </>}
  </dialog>
 </>;
}
