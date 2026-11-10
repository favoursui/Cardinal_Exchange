"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {parseSiweMessage} from 'viem/siwe';
import type {WalletController} from './controller';
import styles from './wallet.module.css';

const statement='Sign in to Cardinal Exchange. This proves wallet ownership and does not authorize transactions or cost gas.';
let pendingAuth:Promise<unknown>=Promise.resolve();
function auth(action:string,body?:unknown) {
 const request=pendingAuth.then(()=>requestAuth(action,body));
 pendingAuth=request.catch(()=>{});
 return request;
}
async function requestAuth(action:string,body?:unknown) {
 const response=await fetch(`/api/auth/${action}`,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
 if(action==='session'&&response.status===401)return null;
 if(!response.ok)throw new Error(response.status===404||response.status===503?'Wallet sign-in is unavailable. Check the API configuration.':'Sign-in failed. Please try again.');
 return response.json() as Promise<{address?:string;message?:string;expiresAt?:number}>;
}
export const signOutWallet=()=>auth('logout',{});
export function WalletSignIn({account,correctNetwork,controller,walletBusy}:{account:string;correctNetwork:boolean;controller:WalletController;walletBusy:boolean}) {
 const [ready,setReady]=useState(false);
 const [expires,setExpires]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const alive=useRef(true),locked=useRef(false),attempted=useRef(false);
 useEffect(()=>{
  alive.current=true;
  let cancelled=false;
  void auth('session').then(async session=>{
   if(cancelled)return;
   if(session?.address?.toLowerCase()===account.toLowerCase()&&typeof session.expiresAt==='number'&&session.expiresAt>Date.now()){
    attempted.current=true;setExpires(session.expiresAt);
   }else if(session)await signOutWallet();
  }).catch(()=>{if(!cancelled){attempted.current=true;setError('Could not check your session. Retry ownership verification.');}}).finally(()=>{if(!cancelled)setReady(true);});
  return()=>{cancelled=true;alive.current=false;};
 },[account]);
 useEffect(()=>{if(!expires)return;const timer=setTimeout(()=>{setExpires(0);setError('Session expired. Verify ownership again when you are ready.');},Math.max(0,expires-Date.now()));return()=>clearTimeout(timer);},[expires]);
 const signIn=useCallback(async()=>{
  if(locked.current||!correctNetwork)return;
  locked.current=true;setBusy(true);setError('');
  try {
   const challenge=await auth('challenge',{address:account});
   if(!alive.current)return;
   if(!challenge?.message)throw new Error('Invalid sign-in challenge.');
   const parsed=parseSiweMessage(challenge.message);
   if(parsed.address?.toLowerCase()!==account.toLowerCase()||parsed.domain!==window.location.host||parsed.uri!==window.location.origin||parsed.scheme!==window.location.protocol.slice(0,-1)||parsed.chainId!==19480||parsed.version!=='1'||parsed.statement!==statement||!parsed.nonce||!parsed.expirationTime||parsed.expirationTime.getTime()<=Date.now()||parsed.expirationTime.getTime()>Date.now()+300_000)throw new Error('Sign-in challenge does not match this site or wallet.');
   const signature=await controller.signInMessage(challenge.message);
   if(!alive.current)return;
   const session=await auth('verify',{message:challenge.message,signature});
   if(!alive.current){await signOutWallet();return;}
   if(session?.address?.toLowerCase()!==account.toLowerCase()||!session.expiresAt)throw new Error('Invalid sign-in session.');
   setExpires(session.expiresAt);
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Sign-in failed.');}
  finally{locked.current=false;if(alive.current)setBusy(false);}
 },[account,correctNetwork,controller]);
 useEffect(()=>{
  if(!ready||!correctNetwork||walletBusy||expires)return;
  const timer=setTimeout(()=>{
   if(attempted.current)return;
   attempted.current=true;
   void signIn();
  },0);
  return()=>clearTimeout(timer);
 },[ready,correctNetwork,walletBusy,expires,signIn]);
 return <>
  <p role="status">{expires?'Signed in to Cardinal':busy?'Confirm ownership in your wallet…':!ready?'Checking wallet session…':'Wallet connected · not signed in'}</p>
  {!expires&&!!error&&<button type="button" className={styles.primary} disabled={!ready||busy||walletBusy||!correctNetwork} onClick={()=>void signIn()}>Retry ownership verification</button>}
  {!expires&&<p className={styles.hint}>Sign a message to prove wallet ownership. No gas or token approval.</p>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}
 </>;
}
