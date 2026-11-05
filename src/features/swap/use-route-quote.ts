"use client";
import {useEffect,useState} from 'react';
import {tokenMetadata,type Token} from '@/lib/config/tokens';
import {api} from '@/features/trading/api';
import {parseQuote,type TradingQuote} from '@/features/trading/validation';
export function baseUnits(amount:string,decimals:number):string|null {
 if(!/^\d+(?:\.\d*)?$/.test(amount)||amount.length>79)return null;
 const [whole,fraction='']=amount.split('.');if(fraction.length>decimals)return null;
 const value=BigInt(whole+fraction.padEnd(decimals,'0'));return value>BigInt(0)&&value<BigInt(2)**BigInt(256)?value.toString():null;
}
export function displayUnits(amount:string,decimals:number):string {
 if(decimals===0)return amount;
 const digits=amount.padStart(decimals+1,'0'),fraction=digits.slice(-decimals).replace(/0+$/,'');return `${digits.slice(0,-decimals)}${fraction?'.'+fraction:''}`;
}
export function useRouteQuote(input:Token,output:Token,amount:string,slippage:string,conversion:boolean) {
 const [result,setResult]=useState<{key:string;quotes:TradingQuote[];status:string}>();
 const [revision,setRevision]=useState(0);const [venue,setVenue]=useState('');
 const amountIn=baseUnits(amount,tokenMetadata[input].decimals),slippageBps=Math.round(Number(slippage)*100);
 const key=JSON.stringify([input,output,amountIn,slippageBps,conversion,revision]);const enabled=!conversion&&amountIn!==null;
 useEffect(()=>{if(!enabled)return;const controller=new AbortController();let expiry:ReturnType<typeof setTimeout>;
 const timer=setTimeout(async()=>{try{
 const data=await api('/v1/quotes',{chainId:19480,tokenIn:tokenMetadata[input].address,tokenOut:tokenMetadata[output].address,amountIn,slippageBps},controller.signal);
 if(!Array.isArray(data.quotes))throw new Error('Invalid quotes.');
 const quotes=data.quotes.map(value=>parseQuote(value,input,output,amountIn!,slippageBps));if(!quotes.length)throw new Error('No available routes.');
 quotes.sort((a,b)=>BigInt(a.amountOut)>BigInt(b.amountOut)?-1:BigInt(a.amountOut)<BigInt(b.amountOut)?1:0);
 if(controller.signal.aborted)return;
 setResult({key,quotes,status:'Available routes · before gas'});
 expiry=setTimeout(()=>setResult({key,quotes:[],status:'Quote expired — refresh'}),Math.max(0,Math.min(...quotes.map(q=>Date.parse(q.expiresAt)))-Date.now()));
 }catch(e){if(!controller.signal.aborted)setResult({key,quotes:[],status:e instanceof Error?e.message:'Quote unavailable'});}},400);
 return()=>{controller.abort();clearTimeout(timer);clearTimeout(expiry);};},[key,enabled,input,output,amountIn,slippageBps]);
 const current=enabled&&result?.key===key?result:undefined;const quotes=current?.quotes??[];
 const quote=quotes.find(q=>q.venue===venue)??quotes[0];
 return {quote,quotes,best:quote===quotes[0],select:setVenue,status:!enabled?'Awaiting quote':current?.status??'Finding route…',refresh:()=>setRevision(v=>v+1),enabled};
}
