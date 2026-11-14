"use client";
import { useRef, useState } from 'react';
import { TokenLogo } from '@/components/ui/token-logo';
import { useWallet } from '@/features/wallet/wallet-provider';
import { tokenMetadata } from '@/lib/config/tokens';
import { CADINAL_LIQUIDITY_DEPLOYMENT } from '@/lib/config/cadinal-deployment';
import { baseUnits, displayBalance, displayUnits } from '@/features/swap/use-route-quote';
import { useBalances, useCapabilities } from '@/features/trading/use-trading-data';
import { useTradingSettings } from '@/features/trading/settings';
import { ReviewButton } from '@/features/trading/review-button';
import type { Intent } from '@/features/trading/validation';
import { useLiquidity } from './use-liquidity';
import type { LiquidityPool } from './data';
import styles from './liquidity-page.module.css';

function Pair({pool}:{pool:LiquidityPool}) {
 return <div className={styles.pair}><span className={styles.pairIcons}><TokenLogo symbol={pool.tokenA}/><TokenLogo symbol={pool.tokenB}/></span><span><strong className={styles.pairName}>{pool.tokenA} / {pool.tokenB}</strong><span className={styles.pairDetail}>Cadinal</span></span></div>;
}
function EmptyIcon() {
 return <svg className={styles.emptyIcon} aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="9" cy="9" r="6"/><path d="M15 9a6 6 0 1 1-6 6M9 6v6m-3-3h6"/></svg>;
}
const liquid = (pool:LiquidityPool) => BigInt(pool.totalSupply)>BigInt(0)&&BigInt(pool.reserveA)>BigInt(0)&&BigInt(pool.reserveB)>BigInt(0);
const share = (value:string|null) => value===null?'—':BigInt(value)===BigInt(0)?'<0.01%':`${(Number(value)/100).toFixed(2)}%`;
type Action={pool:LiquidityPool;mode:'add'|'remove';account:string|null};

export function LiquidityPageContent() {
 const wallet=useWallet(),catalog=useLiquidity(wallet.account),capabilities=useCapabilities();
 const state=catalog.state,positions=state?.pools.filter(pool=>BigInt(pool.lpBalance??'0')>BigInt(0))??[];
 const [tab,setTab]=useState<'positions'|'pools'>('positions'),[search,setSearch]=useState('');
 const [action,setAction]=useState<Action|null>(null);
 const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLElement|null>(null);
 const canAdd=!!CADINAL_LIQUIDITY_DEPLOYMENT&&capabilities.enabled('liquidityAddition','cadinal');
 const canRemove=!!CADINAL_LIQUIDITY_DEPLOYMENT&&capabilities.enabled('liquidityRemoval','cadinal');
 const available=state?.pools??[],query=search.trim().toLowerCase();
 const filtered=available.filter(pool=>`${pool.tokenA} ${pool.tokenB} ${tokenMetadata[pool.tokenA].name} ${tokenMetadata[pool.tokenB].name} ${pool.address}`.toLowerCase().includes(query));
 const openAction=(pool:LiquidityPool,mode:'add'|'remove')=>{
  if(!wallet.account||!wallet.correctNetwork){wallet.open();return;}
  trigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  setAction({pool,mode,account:wallet.account});dialog.current?.showModal();
 };
 const add=()=>{const pool=available.find(liquid);if(pool)openAction(pool,'add');};
 const ready=!!state&&!state.error&&state.configured;
 const count=(value:number)=>!ready?'—':`${state?.partial?'≥ ':''}${value}`;
 return <div className={styles.page}>
  <header className={styles.header}><div><p className={styles.eyebrow}>Cadinal pools · QMS</p><h1>Liquidity</h1><p className={styles.subtitle}>Provide liquidity. Earn a share of pool trading fees.</p></div><div className={styles.headerActions}><button type="button" className={styles.secondary} onClick={catalog.refresh} disabled={!state}>Refresh</button><button type="button" className={styles.primary} onClick={add} disabled={!canAdd||!available.some(liquid)}>+ Add liquidity</button></div></header>
  <div className={styles.stats}>
   <div className={styles.stat}><span className={styles.statLabel}>Available pools</span><strong className={styles.statValue}>{count(available.length)}</strong></div>
   <div className={styles.stat}><span className={styles.statLabel}>Your positions</span><strong className={styles.statValue}>{wallet.account?count(positions.length):'—'}</strong></div>
   <div className={styles.stat}><span className={styles.statLabel}>Network</span><strong className={styles.statValue}>QMS</strong></div>
  </div>
  <div className={styles.tabs} aria-label="Liquidity views"><button className={styles.tab} type="button" aria-pressed={tab==='positions'} onClick={()=>setTab('positions')}>Your positions</button><button className={styles.tab} type="button" aria-pressed={tab==='pools'} onClick={()=>setTab('pools')}>Explore pools</button></div>
  {!state?<div className={styles.loading} role="status">Loading Cadinal pools…</div>:state.error?<div className={styles.empty}><EmptyIcon/><h2>Pools couldn’t be loaded</h2><p role="alert" className={styles.error}>{state.error}</p><button className={styles.secondary} onClick={catalog.refresh}>Try again</button></div>:!state.configured?<div className={styles.empty}><EmptyIcon/><h2>Cadinal pools are not available yet</h2><p>When liquidity is available, you can explore pools and manage your positions here.</p></div>:<>
   {state.partial&&<p className={styles.notice} role="status">Some pools could not be loaded. The list and position count may be incomplete. Refresh to try again.</p>}
   {tab==='positions'?<section aria-label="Your liquidity positions">
    {!wallet.account?<div className={styles.empty}><EmptyIcon/><h2>Your liquidity, in one place</h2><p>Connect your wallet to view your pool positions.</p><button className={styles.primary} onClick={wallet.open}>Connect wallet</button></div>:positions.length===0?<div className={styles.empty}><EmptyIcon/><h2>{state.partial?'No positions found in the loaded pools':'You have no liquidity positions yet'}</h2><p>Explore Cadinal pools to make your first deposit.</p><button className={styles.secondary} onClick={()=>setTab('pools')}>Explore pools</button></div>:<div className={styles.positions}>{positions.map(pool=><article className={styles.positionCard} key={pool.address}>
     <Pair pool={pool}/><div className={styles.positionBody}><div className={styles.reserveRow}><span>Pooled {pool.tokenA}</span><strong>{displayBalance(pool.amountA!,tokenMetadata[pool.tokenA].decimals)} {pool.tokenA}</strong></div><div className={styles.reserveRow}><span>Pooled {pool.tokenB}</span><strong>{displayBalance(pool.amountB!,tokenMetadata[pool.tokenB].decimals)} {pool.tokenB}</strong></div><p className={styles.hint}>Estimated share of pool reserves</p></div>
     <div className={styles.positionFooter}><span>Pool share <strong>{share(pool.shareBps)}</strong></span><span>Pool fee <strong>{(pool.feeBps/100).toFixed(2)}%</strong></span></div>
     <div className={styles.positionActions}><button className={styles.primary} onClick={()=>openAction(pool,'add')} disabled={!canAdd||!liquid(pool)}>Add liquidity</button><button className={styles.secondary} onClick={()=>openAction(pool,'remove')} disabled={!canRemove}>Remove</button></div>
    </article>)}</div>}
   </section>:<section aria-label="Explore Cadinal pools">
    <div className={styles.toolbar}><label className={styles.search}><span className={styles.hint}>Search pools</span><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search by token or pool address" aria-label="Search pools"/></label></div>
    {filtered.length===0?<div className={styles.empty}><EmptyIcon/><h2>{query?'No matching pools':'No pools available yet'}</h2><p>{query?'Try another token name or address.':'Check back when Cadinal pools have liquidity.'}</p></div>:<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Pool</th><th>Pool reserves</th><th>Pool fee</th><th><span className={styles.hint}>Actions</span></th></tr></thead><tbody>{filtered.map(pool=><tr key={pool.address}><td><Pair pool={pool}/></td><td><div>{displayBalance(pool.reserveA,tokenMetadata[pool.tokenA].decimals)} {pool.tokenA}</div><div className={styles.hint}>{displayBalance(pool.reserveB,tokenMetadata[pool.tokenB].decimals)} {pool.tokenB}</div></td><td>{(pool.feeBps/100).toFixed(2)}%</td><td><button className={styles.primary} onClick={()=>openAction(pool,'add')} disabled={!canAdd||!liquid(pool)}>Add liquidity</button></td></tr>)}</tbody></table></div>}
   </section>}
   {(!canAdd||!canRemove)&&<p className={styles.notice}>Liquidity deposits or withdrawals are currently unavailable.</p>}
  </>}
  {capabilities.error&&<p className={styles.error} role="alert">{capabilities.error}</p>}
  <p className={styles.footer}>LP tokens represent your share of the pool. Fees accrue in pool reserves. Token amounts may change as trades occur.</p>
  <dialog ref={dialog} className={styles.actionDialog} aria-labelledby="liquidity-action-title" onClose={()=>{setAction(null);trigger.current?.focus();}}>
   {action&&<><div className={styles.dialogHeader}><h2 id="liquidity-action-title">{action.mode==='add'?'Add liquidity':'Remove liquidity'}</h2><button className={styles.closeButton} aria-label="Close liquidity form" onClick={()=>dialog.current?.close()}>×</button></div>
   {wallet.account===action.account?<LiquidityForm key={`${action.pool.address}:${action.mode}:${action.account}`} pool={state?.pools.find(p=>p.address===action.pool.address)??action.pool} mode={action.mode} enabled={action.mode==='add'?canAdd:canRemove} onComplete={catalog.refresh}/>:<p role="status" className={styles.notice}>Your wallet changed. Close this form and select the pool again.</p>}
   </>}
  </dialog>
 </div>;
}

function LiquidityForm({pool,mode,enabled,onComplete}:{pool:LiquidityPool;mode:'add'|'remove';enabled:boolean;onComplete:()=>void}) {
 const wallet=useWallet(),settings=useTradingSettings();
 const balances=useBalances(wallet.account,'cadinal');
 const [amountA,setAmountA]=useState(''),[amountB,setAmountB]=useState('');
 const tokenA=pool.tokenA,tokenB=pool.tokenB;
 const a=baseUnits(amountA,mode==='remove'?18:tokenMetadata[tokenA].decimals),b=baseUnits(amountB,tokenMetadata[tokenB].decimals);
 const balanceA=balances.balances[tokenA],balanceB=balances.balances[tokenB];
 const insufficient=mode==='remove'?!!a&&BigInt(a)>BigInt(pool.lpBalance??'0'):!!a&&balanceA!==undefined&&BigInt(a)>BigInt(balanceA)||!!b&&balanceB!==undefined&&BigInt(b)>BigInt(balanceB);
 const intent:Intent|null=a&&(mode==='remove'||b)&&!insufficient?{kind:mode,venue:'cadinal',tokenA,tokenB,amountA:a,amountB:b??'0',slippageBps:Math.round(Number(settings.slippage)*100),pool:pool.address}:null;
 const setDeposit=(value:string)=>{
  if(!/^\d*(\.\d*)?$/.test(value))return;
  setAmountA(value);
  const units=baseUnits(value,tokenMetadata[tokenA].decimals);
  if(units&&BigInt(pool.reserveA)>BigInt(0))setAmountB(displayUnits((BigInt(units)*BigInt(pool.reserveB)/BigInt(pool.reserveA)).toString(),tokenMetadata[tokenB].decimals));
  else setAmountB('');
 };
 const complete=()=>{balances.refresh();onComplete();};
 const success=(submitted:Intent)=>{if((submitted.kind==='add'||submitted.kind==='remove')&&submitted.amountA===a&&submitted.amountB===(b??'0')){setAmountA('');setAmountB('');}};
 return <div className={styles.form}><Pair pool={pool}/>
  {mode==='add'?<>
   <label className={styles.field}>Deposit {tokenA}<div className={styles.tokenAmount}><TokenLogo symbol={tokenA}/><input className={styles.amountInput} value={amountA} inputMode="decimal" placeholder="0.00" maxLength={79} onChange={event=>setDeposit(event.target.value)}/><span>{tokenA}</span></div></label>
   <p className={styles.balance}>Balance: {balanceA!==undefined?displayBalance(balanceA,tokenMetadata[tokenA].decimals):'—'} {tokenA}</p>
   <label className={styles.field}>Deposit {tokenB}<div className={styles.tokenAmount}><TokenLogo symbol={tokenB}/><input className={styles.amountInput} value={amountB} inputMode="decimal" placeholder="0.00" maxLength={79} onChange={event=>{if(/^\d*(\.\d*)?$/.test(event.target.value))setAmountB(event.target.value);}}/><span>{tokenB}</span></div></label>
   <p className={styles.balance}>Balance: {balanceB!==undefined?displayBalance(balanceB,tokenMetadata[tokenB].decimals):'—'} {tokenB}</p>
   <p className={styles.hint}>Amounts start at the pool ratio. These are deposit limits; unused tokens remain in your wallet. Wrap native QMS before adding it to a pool.</p>
  </>:<><label className={styles.field}>LP tokens to remove<input className={styles.amountInput} value={amountA} inputMode="decimal" placeholder="0.00" maxLength={79} onChange={event=>{if(/^\d*(\.\d*)?$/.test(event.target.value))setAmountA(event.target.value);}}/></label><p className={styles.balance}>Available: {displayBalance(pool.lpBalance??'0',18)} LP</p><div className={styles.percentButtons}>{[25,50,75,100].map(percent=><button type="button" key={percent} onClick={()=>setAmountA(displayUnits((BigInt(pool.lpBalance??'0')*BigInt(percent)/BigInt(100)).toString(),18))}>{percent}%</button>)}</div><p className={styles.hint}>Your withdrawal returns both pool tokens. Final amounts are checked before signing.</p></>}
  {insufficient&&<p className={styles.error} role="alert">Insufficient balance for this amount.</p>}
  <div className={styles.reserveRow}><span>Slippage tolerance</span><button className={styles.secondary} onClick={settings.open}>{settings.slippage}%</button></div>
  <ReviewButton intent={intent} enabled={enabled} label={mode==='add'?'Review deposit':'Review withdrawal'} onComplete={complete} onSuccess={success}/>
 </div>;
}
