"use client";
import {useEffect,useState} from 'react';
import {tokens,tokenMetadata,type Token} from '@/lib/config/tokens';
import {api,object,uint} from './api';
import {same} from './validation';
export function useCapabilities() {
 const [state,setState]=useState<{operations?:Record<string,unknown>;error?:string}>({});
 useEffect(()=>{const c=new AbortController();api('/v1/capabilities',undefined,c.signal).then(data=>{if(data.chainId!==19480||data.testnet!==true)throw new Error('Unsupported API network.');setState({operations:object(data.operations)});}).catch(e=>{if(!c.signal.aborted)setState({error:e instanceof Error?e.message:'API unavailable'});});return()=>c.abort();},[]);
 return {error:state.error,ready:!!state.operations,enabled:(name:string)=>{const value=state.operations?.[name];return !!value&&typeof value==='object'&&'enabled' in value&&value.enabled===true;}};
}
export function useBalances(account:string|null) {
 const [state,setState]=useState<{account:string;balances:Partial<Record<Token,string>>}>();
 const [revision,setRevision]=useState(0);
 useEffect(()=>{if(!account)return;const c=new AbortController();let timer:ReturnType<typeof setTimeout>;const balances:Partial<Record<Token,string>>={};
 const run=async()=>{for(const token of tokens){if(c.signal.aborted)return;try{const data=await api(`/v1/wallets/${account}/qwap?token=${tokenMetadata[token].address}`,undefined,c.signal);if(data.chainId!==19480||!same(data.wallet,account)||!same(object(data.token).address,tokenMetadata[token].address))throw new Error('Invalid wallet balance');balances[token]=uint(data.balance).toString();}catch{delete balances[token];}if(!c.signal.aborted)setState({account,balances:{...balances}});}if(!c.signal.aborted)timer=setTimeout(run,30_000);};
 void run();return()=>{c.abort();clearTimeout(timer);};},[account,revision]);
 return {balances:state?.account===account?state.balances:{},refresh:()=>setRevision(n=>n+1)};
}
