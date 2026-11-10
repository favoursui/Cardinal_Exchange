"use client";
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
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

function DetailedReviewButton({intent,enabled,label,onComplete,inline=false,onPrepared}:{intent:Intent|null;enabled:boolean;label:string;onComplete:()=>void;inline?:boolean;onPrepared?:(review:Review,intent:Intent)=>void}) {
 const wallet=useWallet();const dialog=useRef<HTMLDialogElement>(null);const trigger=useRef<HTMLButtonElement>(null);
 const [reviewIntent,setReviewIntent]=useState('');
 const [visible,setVisible]=useState(false);
 const open=()=>{setVisible(true);if(!inline)dialog.current?.showModal();};
 const close=()=>{setVisible(false);dialog.current?.close();trigger.current?.focus();};
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
  if(result && status!=='confirmed' && status!=='reverted'){open();return;}
  if(!intent||locked.current)return;
  locked.current=true;setBusy(true);setError('');setReview(undefined);setResult(undefined);setStatus(undefined);setStatusError(false);
  setReviewIntent(JSON.stringify(intent));
  captured.current={intent,account:wallet.account};const current=captured.current;
  open(); request.current=new AbortController();
  try {
   await verifyContracts(current.intent,wallet.readRpc);
   const requestData=requestFor(current.intent,current.account);
   const data=await api(requestData.path,requestData.body,request.current.signal);
   const next=validatePreparation(data,current.intent,current.account);
   if(alive.current){setReview(next);setNow(Date.now());onPrepared?.(next,current.intent);}
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Preparation failed.');}
  finally{locked.current=false;if(alive.current)setBusy(false);}
 };
 const confirm=async()=>{
  if(!review||locked.current||!captured.current)return;
  if(JSON.stringify(intent)!==JSON.stringify(captured.current.intent)){setError('Trade changed. Prepare again.');return;}
  if(!same(wallet.account,captured.current.account)||!wallet.correctNetwork){setError('Wallet changed. Prepare again.');return;}
  locked.current=true;setBusy(true);setError('');
  try {const sent=await wallet.sendTransaction(review.transaction);if(alive.current){setResult(sent);onComplete();}}
  catch(e){if(alive.current)setError(e instanceof Error?e.message:'Wallet request failed.');}
  finally{locked.current=false;if(alive.current)setBusy(false);}
 };
 let explorer:string|undefined;try{explorer=qmsWalletChain().blockExplorerUrls[0].replace(/\/$/,'');}catch{}
 const expired=review && now>=review.transaction.expiresAt;
 const content=<>
   <div className={styles.heading}><h2 id="transaction-review-title">{result?(status==='confirmed'?'Transaction confirmed':status==='reverted'?'Transaction reverted':'Transaction submitted'):review?.title??'Prepare transaction'}</h2><button type="button" disabled={busy} aria-label="Close transaction review" onClick={close}>×</button></div>
   {busy&&<p role="status">{review?'Check your wallet to confirm.':'Checking contracts and preparing transaction…'}</p>}
   {error&&<p role="alert" className={styles.error}>{error}</p>}
   {result?<>
    <p role="status">{statusError?'Status unavailable — check the explorer before continuing.':status?statusLabels[status]:'Checking confirmation…'}</p>
    <p>{review?.approval?(status==='confirmed'?'Approval confirmed. Prepare again to continue.':'Waiting for approval confirmation before the next step.'):'Your transaction is also saved in History.'}</p>
    <p className={styles.hash}>{explorer?<a href={`${explorer}/tx/${result.hash}`} target="_blank" rel="noopener noreferrer">{result.hash} ↗</a>:result.hash}</p>
    {!result.historySaved&&<p role="alert">Browser history could not be saved. Keep the hash above.</p>}
    <button type="button" className={styles.primary} onClick={close}>Done</button>
   </>:<>
    {review&&<><ul className={styles.reviewLines}>{review.lines.map(line=><li key={line}>{line}</li>)}</ul><p className={styles.hash}>Wallet: {review.transaction.from}</p><p className={styles.hint}>QMS Testnet · Review the amount and recipient in your wallet.</p>
    {expired?<p role="status">Review expired. Prepare again for current amounts.</p>:<p className={styles.hint}>Review valid for {Math.max(0,Math.ceil((review.transaction.expiresAt-now)/1000))} seconds.</p>}
    <button type="button" className={styles.primary} disabled={busy||expired||JSON.stringify(intent)!==reviewIntent||!same(wallet.account,review.transaction.from)||!wallet.correctNetwork} onClick={()=>void confirm()}>{review.approval?'Confirm approval in wallet':'Confirm in wallet'}</button></>}
    {(!review||expired||error)&&!busy&&<button type="button" className={styles.secondary} onClick={()=>void prepare()}>Prepare again</button>}
   </>}
 </>;
 return <>
  <button ref={trigger} type="button" className={styles.primary} disabled={busy || (!result&&!!wallet.account&&wallet.correctNetwork&&(!enabled||!intent))} onClick={()=>void prepare()}>{wallet.busy?'Check your wallet':!wallet.account?'Connect wallet':!wallet.correctNetwork?'Switch to QMS Testnet':result&&status!=='confirmed'&&status!=='reverted'?'View pending transaction':label}</button>
  {inline ? (visible && <div className={styles.inlineReview} aria-labelledby="transaction-review-title">{content}</div>) : <dialog ref={dialog} className={styles.dialog} aria-labelledby="transaction-review-title" onCancel={event=>{if(busy)event.preventDefault();}} onClose={()=>trigger.current?.focus()}>{content}</dialog>}
 </>;
}

type ActionProps = {intent:Intent|null;enabled:boolean;label:string;onComplete:()=>void;onSuccess?:(intent:Intent)=>void;inline?:boolean;onPrepared?:(review:Review,intent:Intent)=>void};

export function ReviewButton(props:ActionProps) {
 return props.inline ? <SwapAction {...props} /> : <DetailedReviewButton {...props} />;
}

function SwapAction({intent,enabled,onComplete,onPrepared,onSuccess}:ActionProps) {
 const wallet=useWallet();
 const key=JSON.stringify([wallet.account,wallet.chainId,intent]);
 const intentJson=JSON.stringify(intent);
 const callbacks=useRef({onComplete,onPrepared,onSuccess});
 useEffect(()=>{callbacks.current={onComplete,onPrepared,onSuccess};},[onComplete,onPrepared,onSuccess]);
 const [prepared,setPrepared]=useState<{key:string;review:Review}>();
 const [failure,setFailure]=useState<{key:string;message:string}>();
 const [revision,setRevision]=useState(0);
 const [sending,setSending]=useState(false);
 const lock=useRef(false);
 const [result,setResult]=useState<{hash:string;historySaved:boolean;approval:boolean;intent:Intent}>();
 const [status,setStatus]=useState<TransactionStatus['status']>();
 const [statusError,setStatusError]=useState(false);
 const pending=!!result&&status!=='confirmed'&&status!=='reverted';
 const read=wallet.readRpc,account=wallet.account,correctNetwork=wallet.correctNetwork;
 useEffect(()=>{
  const current=JSON.parse(intentJson) as Intent|null;
  if(!current||!enabled||!account||!correctNetwork||sending||pending)return;
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  const prepare=async()=>{
   try {
    await verifyContracts(current,read);
    if(controller.signal.aborted)return;
    const request=requestFor(current,account);
    const data=await api(request.path,request.body,controller.signal);
    if(controller.signal.aborted)return;
    const review=validatePreparation(data,current,account);
    setPrepared({key,review});setFailure(undefined);
    callbacks.current.onPrepared?.(review,current);
    timer=setTimeout(()=>{setPrepared(undefined);setRevision(n=>n+1);},Math.max(0,review.transaction.expiresAt-Date.now()));
   } catch(error) {
    if(!controller.signal.aborted){setPrepared(undefined);setFailure({key,message:error instanceof Error?error.message:'Preparation unavailable.'});}
   }
  };
  void prepare();return()=>{controller.abort();clearTimeout(timer);};
 },[key,intentJson,enabled,account,correctNetwork,sending,pending,revision,read]);
 useEffect(()=>{
  if(!result)return;
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{
   if(document.visibilityState==='hidden'){timer=setTimeout(poll,10_000);return;}
   try {
    const next=parseStatus(await api(`/v1/transactions/${result.hash}`,undefined,controller.signal),result.hash);
    if(controller.signal.aborted)return;
    setStatus(next.status);setStatusError(false);
    if(next.status==='confirmed'||next.status==='reverted'){
     if(next.status==='confirmed'&&!result.approval)callbacks.current.onSuccess?.(result.intent);
     callbacks.current.onComplete();return;
    }
   } catch {if(controller.signal.aborted)return;setStatusError(true);}
   timer=setTimeout(poll,10_000);
  };
  void poll();return()=>{controller.abort();clearTimeout(timer);};
 },[result]);
 const review=prepared?.key===key?prepared.review:undefined;
 const error=failure?.key===key?failure.message:undefined;
 const submit=async()=>{
  if(!account||!correctNetwork){wallet.open();return;}
  if(lock.current||pending||!intent)return;
  if(!review||review.transaction.expiresAt<=Date.now()) {setPrepared(undefined);setFailure(undefined);setRevision(n=>n+1);return;}
  lock.current=true;setSending(true);setFailure(undefined);setStatus(undefined);setStatusError(false);setResult(undefined);
  // Capture the validated payload once. Quote refreshes never replace a wallet request.
  const transaction=review.transaction;
  try {const sent=await wallet.sendTransaction(transaction);setResult({...sent,approval:review.approval,intent});callbacks.current.onComplete();}
  catch(error){setFailure({key,message:error instanceof Error?error.message:'Wallet request failed.'});}
  finally{setPrepared(undefined);lock.current=false;setSending(false);}
 };
 let explorer:string|undefined;try{explorer=qmsWalletChain().blockExplorerUrls[0].replace(/\/$/,'');}catch{}
 const token=intent?.kind==='swap'?intent.quote.tokenIn:'';
 const action=review?.approval?`${review.title==='Reset token allowance'?'Reset':'Approve'} ${token}`:intent?.kind==='wrap'?'WRAP':intent?.kind==='unwrap'?'UNWRAP':'SWAP';
 const label=sending?'CONFIRM IN WALLET…':!account?'Connect wallet':!correctNetwork?'Switch to QMS Testnet':pending?'CONFIRMING…':!intent?'Enter an amount':!enabled?'Swaps unavailable':review?action:error?'Retry':'PREPARING…';
 return <>
  <button type="button" className={styles.primary} disabled={sending||wallet.busy||pending||(!!account&&correctNetwork&&(!enabled||!intent||(!review&&!error)))} onClick={()=>void submit()}>{label}</button>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {result&&status!=='confirmed'&&<p role="status" className={styles.hint}>{statusError?'Status unavailable — check the explorer.':status?statusLabels[status]:'Transaction submitted.'} {explorer&&<a href={`${explorer}/tx/${result.hash}`} target="_blank" rel="noopener noreferrer">View transaction ↗</a>}</p>}
  {result&&status==='confirmed'&&<SuccessToast key={result.hash} title={result.approval?'Approval confirmed':result.intent.kind==='swap'?'Swap successful':'Conversion successful'} href={explorer?`${explorer}/tx/${result.hash}`:undefined} />}
  {result&&!result.historySaved&&<p role="alert" className={styles.hash}>History could not be saved. Keep this hash: {result.hash}</p>}
 </>;
}

function SuccessToast({title,href}:{title:string;href?:string}) {
 const [visible,setVisible]=useState(true);
 useEffect(()=>{const timer=setTimeout(()=>setVisible(false),5000);return()=>clearTimeout(timer);},[]);
 if(!visible)return null;
 return createPortal(<div className={styles.successToast} role="status" aria-live="polite">
  <span className={styles.successIcon} aria-hidden="true">✓</span>
  <div><strong>{title}</strong>{href&&<a href={href} target="_blank" rel="noopener noreferrer">View transaction ↗</a>}</div>
  <button type="button" aria-label="Dismiss transaction notification" onClick={()=>setVisible(false)}>×</button>
 </div>,document.body);
}
