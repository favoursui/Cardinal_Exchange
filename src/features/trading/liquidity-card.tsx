"use client";
import {useEffect,useState} from 'react';
import {tokenMetadata,tokens,type Token} from '@/lib/config/tokens';
import {useWallet} from '@/features/wallet/wallet-provider';
import {baseUnits,displayUnits,displayBalance} from '@/features/swap/use-route-quote';
import {api,object,uint} from './api';
import {addr,same,type Intent} from './validation';
import {ROUTER,FACTORY} from './contracts';
import {useBalances,useCapabilities} from './use-trading-data';
import {useTradingSettings} from './settings';
import {ReviewButton} from './review-button';
import styles from './trading.module.css';
type Pool={address:`0x${string}`;lpBalance:string;reserveA:string;reserveB:string};
export function LiquidityCard() {
 const settings=useTradingSettings(); const slippage=settings.slippage;
 const wallet=useWallet(),capabilities=useCapabilities(),balances=useBalances(wallet.account);
 const [tokenA,setA]=useState<Token>('WQMS'),[tokenB,setB]=useState<Token>('USDC');
 const [mode,setMode]=useState<'add'|'remove'>('add');const [amountA,setAmountA]=useState(''),[amountB,setAmountB]=useState('');
 const [revision,setRevision]=useState(0);const [result,setResult]=useState<{key:string;pool?:Pool;error?:string}>();
 const key=JSON.stringify([tokenA,tokenB,wallet.account,revision]);
 useEffect(()=>{if(tokenA===tokenB)return;const c=new AbortController();const query=new URLSearchParams({tokenA:tokenMetadata[tokenA].address,tokenB:tokenMetadata[tokenB].address,...(wallet.account?{wallet:wallet.account}:{})});
 api(`/v1/pools/qwap?${query}`,undefined,c.signal).then(data=>{
 if(data.chainId!==19480||data.venue!=='qwap'||!same(data.router,ROUTER)||!same(data.factory,FACTORY))throw new Error('Invalid pool.');
 const t0=object(data.token0),t1=object(data.token1),forward=same(t0.address,tokenMetadata[tokenA].address);
 if(!(forward?same(t1.address,tokenMetadata[tokenB].address):same(t0.address,tokenMetadata[tokenB].address)&&same(t1.address,tokenMetadata[tokenA].address)))throw new Error('Pool tokens do not match.');
 const position=data.position?object(data.position):null;
 if(wallet.account&&(!position||!same(position.wallet,wallet.account)))throw new Error('Wrong pool account.');
 const pool={address:addr(data.pool),lpBalance:position?uint(position.lpBalance).toString():'0',reserveA:uint(forward?data.reserve0:data.reserve1).toString(),reserveB:uint(forward?data.reserve1:data.reserve0).toString()};
 setResult({key,pool});
 }).catch(e=>{if(!c.signal.aborted)setResult({key,error:e instanceof Error?e.message:'Pool unavailable'});});return()=>c.abort();},[key,tokenA,tokenB,wallet.account]);
 const current=result?.key===key?result:undefined,pool=current?.pool;
 const validSlippage=/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(slippage)&&Number(slippage)>=0&&Number(slippage)<=5;
 const a=baseUnits(amountA,mode==='remove'?18:tokenMetadata[tokenA].decimals),b=baseUnits(amountB,tokenMetadata[tokenB].decimals);
 const intent:Intent|null=pool&&tokenA!==tokenB&&a&&validSlippage&&(mode==='remove'||b)?{kind:mode,tokenA,tokenB,amountA:a,amountB:b??'0',slippageBps:Math.round(Number(slippage)*100),pool:pool.address}:null;
 const refresh=()=>{setRevision(n=>n+1);balances.refresh();};
 const select=(value:string,set:(t:Token)=>void)=>{if(tokens.includes(value as Token)&&value!=='QMS'){set(value as Token);setAmountA('');setAmountB('');}};
 return <section className={styles.liquidity} aria-labelledby="liquidity-title"><h1 id="liquidity-title">Liquidity</h1>
 <p className={styles.hint}>QWAP · Existing ERC-20 pools on QMS Testnet. Wrap QMS before adding liquidity.</p>
 <div className={styles.tabs}>{(['add','remove'] as const).map(value=><button type="button" key={value} aria-pressed={mode===value} onClick={()=>{setMode(value);setAmountA('');setAmountB('');}}>{value==='add'?'Add liquidity':'Remove liquidity'}</button>)}</div>
 <label className={styles.field}>First token<select value={tokenA} onChange={e=>select(e.target.value,setA)}>{tokens.filter(t=>t!=='QMS').map(t=><option key={t}>{t}</option>)}</select></label>
 <label className={styles.field}>Second token<select value={tokenB} onChange={e=>select(e.target.value,setB)}>{tokens.filter(t=>t!=='QMS').map(t=><option key={t}>{t}</option>)}</select></label>
 {tokenA===tokenB?<p className={styles.error}>Choose two different tokens.</p>:current?.error?<p role="alert" className={styles.error}>{current.error}</p>:!pool?<p role="status">Loading pool…</p>:<div className={styles.pool}><p>Pool: {pool.address}</p><p>Reserves: {displayUnits(pool.reserveA,tokenMetadata[tokenA].decimals)} {tokenA} / {displayUnits(pool.reserveB,tokenMetadata[tokenB].decimals)} {tokenB}</p>{wallet.account&&<p>Your LP tokens: {displayUnits(pool.lpBalance,18)}</p>}</div>}
 <button type="button" className={styles.secondary} onClick={refresh}>Refresh pool and balances</button>
 <label className={styles.field}>{mode==='add'?`${tokenA} maximum deposit`:'LP tokens to remove'}<input inputMode="decimal" value={amountA} onChange={e=>{if(/^\d*(\.\d*)?$/.test(e.target.value))setAmountA(e.target.value);}} maxLength={79}/></label>
 {mode==='remove'&&pool&&wallet.account&&<button type="button" className={styles.secondary} onClick={()=>setAmountA(displayUnits(pool.lpBalance,18))}>Use all LP tokens</button>}
 {mode==='add'&&<><p className={styles.hint}>Balance: {balances.balances[tokenA]!==undefined?displayBalance(balances.balances[tokenA]!,tokenMetadata[tokenA].decimals):'—'} {tokenA}</p><label className={styles.field}>{tokenB} maximum deposit<input inputMode="decimal" value={amountB} onChange={e=>{if(/^\d*(\.\d*)?$/.test(e.target.value))setAmountB(e.target.value);}} maxLength={79}/></label><p className={styles.hint}>Balance: {balances.balances[tokenB]!==undefined?displayBalance(balances.balances[tokenB]!,tokenMetadata[tokenB].decimals):'—'} {tokenB}</p></>}
 <div className={styles.field}>Slippage tolerance: {slippage}%<button type="button" className={styles.secondary} onClick={settings.open}>Change slippage</button></div>
 {!validSlippage&&<p className={styles.error}>Use 0–5%, with up to two decimal places.</p>}
 {capabilities.error&&<p className={styles.error}>{capabilities.error}</p>}
 {capabilities.ready&&!capabilities.enabled(mode==='add'?'liquidityAddition':'liquidityRemoval')&&<p className={styles.hint}>Liquidity preparation is disabled on the API.</p>}
 <ReviewButton key={`${wallet.account}:${wallet.chainId}`} intent={intent} enabled={capabilities.enabled(mode==='add'?'liquidityAddition':'liquidityRemoval')} label={mode==='add'?'Review deposit':'Review withdrawal'} onComplete={refresh}/>
 </section>;
}
