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
// Display only: keep exact base units for transactions and MAX.
export function displayBalance(amount:string,decimals:number):string {
 const full=displayUnits(amount,decimals);
 const [whole,fraction='']=full.split('.');
 const short=fraction.slice(0,4).replace(/0+$/,'');
 if(BigInt(amount)>BigInt(0)&&BigInt(whole)===BigInt(0)&&!short)return '<0.0001';
 return `${whole}${short?'.'+short:''}`;
}
export function useRouteQuote(input:Token,output:Token,amount:string,slippage:string,conversion:boolean) {
 const [result,setResult]=useState<{key:string;quotes:TradingQuote[];status:string}>();
 const [revision,setRevision]=useState(0);const [venue,setVenue]=useState('');
 const amountIn=baseUnits(amount,tokenMetadata[input].decimals),slippageBps=Math.round(Number(slippage)*100);
 const key=JSON.stringify([input,output,amountIn,slippageBps,conversion,revision]);const enabled=!conversion&&amountIn!==null;
 useEffect(()=>{
  if(!enabled)return;
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>;
  let inFlight=false;
  let expiresAt=0;
  const schedule=(delay:number)=>{clearTimeout(timer);timer=setTimeout(()=>void fetchQuotes(),delay);};
  const fetchQuotes=async()=>{
   if(controller.signal.aborted||inFlight||document.visibilityState==='hidden')return;
   inFlight=true;
   setResult({key,quotes:[],status:'Finding route…'});
   try {
    const data=await api('/v1/quotes',{chainId:19480,tokenIn:tokenMetadata[input].address,tokenOut:tokenMetadata[output].address,amountIn,slippageBps},controller.signal);
    if(controller.signal.aborted)return;
    if(!Array.isArray(data.quotes))throw new Error('Invalid quotes.');
    const quotes=data.quotes.map(value=>parseQuote(value,input,output,amountIn!,slippageBps));
    if(!quotes.length)throw new Error('No available routes.');
    quotes.sort((a,b)=>BigInt(a.amountOut)>BigInt(b.amountOut)?-1:BigInt(a.amountOut)<BigInt(b.amountOut)?1:0);
    expiresAt=Math.min(...quotes.map(q=>Date.parse(q.expiresAt)));
    setResult({key,quotes,status:'Available routes · before gas'});
    clearTimeout(timer);
    timer=setTimeout(()=>{
     expiresAt=0;
     setResult({key,quotes:[],status:'Refreshing quote…'});
     void fetchQuotes();
    },Math.max(0,expiresAt-Date.now()));
   } catch(e) {
    if(!controller.signal.aborted){
     expiresAt=0;
     setResult({key,quotes:[],status:e instanceof Error?e.message:'Quote unavailable'});
     schedule(15_000);
    }
   } finally {inFlight=false;}
  };
  const visibility=()=>{
   if(document.visibilityState==='visible'&&expiresAt<=Date.now()&&!inFlight)schedule(0);
  };
  document.addEventListener('visibilitychange',visibility);
  schedule(400);
  return()=>{controller.abort();clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);};
 },[key,enabled,input,output,amountIn,slippageBps]);
 const current=enabled&&result?.key===key?result:undefined;const quotes=current?.quotes??[];
 const quote=quotes.find(q=>q.venue===venue)??quotes[0];
 return {quote,quotes,best:quote===quotes[0],select:setVenue,status:!enabled?'Awaiting quote':current?.status??'Finding route…',refresh:()=>setRevision(v=>v+1),enabled};
}
