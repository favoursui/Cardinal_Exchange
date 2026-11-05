import { encodeFunctionData, getAddress, type Address, type Hex } from 'viem';
import { tokenMetadata, type Token } from '@/lib/config/tokens';
import type { WalletTransaction } from '@/features/wallet/controller';
import { abi, ROUTER, WQMS, NATIVE } from './contracts';
import { object, text, uint } from './api';
export const same = (a: unknown, b: unknown) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
export const addr = (value: unknown): Address => getAddress(text(value));
export const hex = (value: bigint) => `0x${value.toString(16)}`;
const requireThat = (condition: unknown) => { if (!condition) throw new Error('Transaction does not match your reviewed request.'); };
const addressOf = (token: Token) => tokenMetadata[token].address;
const pathAddress = (token: Token) => token === 'QMS' ? WQMS : addressOf(token);
export type TradingQuote = { quoteId: string; venue: string; venueName: string; amountOut: string; minimumAmountOut: string; expiresAt: string; path: Address[]; pools: Address[]; tokenIn: Token; tokenOut: Token; amountIn: string; slippageBps: number };
export function parseQuote(value: unknown, input: Token, output: Token, amount: string, slippage: number): TradingQuote {
 const q=object(value), path=(q.path as unknown[]), pools=(q.pools as unknown[]);
 requireThat(q.chainId===19480 && q.venue==='qwap' && same(q.router,ROUTER) && !q.cardinalFee && same(q.tokenIn,addressOf(input)) && same(q.tokenOut,addressOf(output)) && q.amountIn===amount && q.slippageBps===slippage);
 requireThat(Array.isArray(path) && path.length>=2 && path.length<=3 && same(path[0],pathAddress(input)) && same(path.at(-1),pathAddress(output)) && (path.length!==3 || same(path[1],WQMS)));
 requireThat(Array.isArray(pools) && pools.length===path.length-1);
 requireThat(uint(q.amountOut)>BigInt(0) && uint(q.minimumAmountOut)>BigInt(0) && uint(q.minimumAmountOut)===uint(q.amountOut)*BigInt(10000-slippage)/BigInt(10000));
 requireThat(/^[0-9a-f-]{36}$/i.test(text(q.quoteId)) && text(q.venueName).length>0 && text(q.venueName).length<=80);
 const expires=Date.parse(text(q.expiresAt)); requireThat(expires>Date.now() && expires<=Date.now()+15_000);
 return {quoteId:text(q.quoteId),venue:'qwap',venueName:text(q.venueName),amountOut:text(q.amountOut),minimumAmountOut:text(q.minimumAmountOut),expiresAt:text(q.expiresAt),path:path.map(addr),pools:pools.map(addr),tokenIn:input,tokenOut:output,amountIn:amount,slippageBps:slippage};
}
export type Intent = {kind:'swap';quote:TradingQuote} | {kind:'wrap';amount:string} | {kind:'unwrap';amount:string} | {kind:'add'|'remove';tokenA:Token;tokenB:Token;amountA:string;amountB:string;slippageBps:number;pool:Address};
export type Review = {transaction:WalletTransaction;title:string;lines:string[];approval:boolean;addresses:Address[];pool?:{address:Address;tokenA:Address;tokenB:Address}};
function quantity(value: string, token:Token) {
 const decimals=tokenMetadata[token].decimals, padded=value.padStart(decimals+1,'0');
 const fraction=padded.slice(-decimals).replace(/0+$/,''); return `${padded.slice(0,-decimals)}${fraction?'.'+fraction:''} ${token}`;
}
export function requestFor(intent:Intent, wallet:string) {
 if(intent.kind==='swap')return {path:'/v1/transactions/prepare',body:{quoteId:intent.quote.quoteId,wallet}};
 if(intent.kind==='wrap'||intent.kind==='unwrap')return {path:'/v1/native/prepare',body:{chainId:19480,operation:intent.kind,amount:intent.amount,wallet}};
 return {path:`/v1/liquidity/${intent.kind}/prepare`,body:{chainId:19480,venue:'qwap',tokenA:addressOf(intent.tokenA),tokenB:addressOf(intent.tokenB),slippageBps:intent.slippageBps,wallet,...(intent.kind==='add'?{amountADesired:intent.amountA,amountBDesired:intent.amountB}:{liquidity:intent.amountA})}};
}
export function validatePreparation(raw:unknown,intent:Intent,wallet:string):Review {
 const r=object(raw); requireThat(r.chainId===19480 && !r.cardinalFee);
 const account=getAddress(wallet), addresses:Address[]=[ROUTER];
 let pool:Review['pool'];
 const amounts=new Map<string,{amount:string;symbol:Token|'LP'}>();
 if(intent.kind==='swap') {
  requireThat(r.venue===intent.quote.venue && r.quoteId===intent.quote.quoteId);
  addresses.push(...intent.quote.path);
  if(intent.quote.tokenIn!=='QMS')amounts.set(addressOf(intent.quote.tokenIn).toLowerCase(),{amount:intent.quote.amountIn,symbol:intent.quote.tokenIn});
 } else if(intent.kind==='wrap'||intent.kind==='unwrap') { addresses.splice(0,1,WQMS); }
 else {
  requireThat(r.venue==='qwap' && intent.tokenA!=='QMS' && intent.tokenB!=='QMS' && intent.tokenA!==intent.tokenB);
  const tokenA=addr(addressOf(intent.tokenA)),tokenB=addr(addressOf(intent.tokenB)); addresses.push(tokenA,tokenB);
  pool={address:intent.pool,tokenA,tokenB};
  if(intent.kind==='add'){amounts.set(tokenA.toLowerCase(),{amount:intent.amountA,symbol:intent.tokenA});amounts.set(tokenB.toLowerCase(),{amount:intent.amountB,symbol:intent.tokenB});}
  else amounts.set(intent.pool.toLowerCase(),{amount:intent.amountA,symbol:'LP'});
 }
 if(r.status==='approval_required') {
  requireThat(intent.kind!=='wrap' && intent.kind!=='unwrap');
  const approvals=Array.isArray(r.approvals)?r.approvals:[r]; requireThat(approvals.length>0 && approvals.length<=amounts.size);
  for(const item of approvals) {
   const a=object(item), allowed=amounts.get(addr(a.token).toLowerCase());
   requireThat(allowed && same(a.owner,account) && same(a.spender,ROUTER) && a.amount===allowed.amount && uint(a.currentAllowance)<uint(a.amount) && a.resetAllowanceFirst===(uint(a.currentAllowance)>BigInt(0)));
  }
  const a=object(approvals[0]), token=addr(a.token), allowed=amounts.get(token.toLowerCase())!;
  const reset=a.resetAllowanceFirst===true, amount=reset?BigInt(0):uint(a.amount);
  const label=allowed.symbol==='LP'?`${amount} LP base units`:quantity(amount.toString(),allowed.symbol);
  return {approval:true,title:reset?'Reset token allowance':'Approve token spending',lines:[`${reset?'Reset to':'Approve exactly'} ${label}`,`Spender: ${ROUTER}`,'Wait for confirmation, then prepare again.'],addresses,pool,
   transaction:{from:account,to:token,data:encodeFunctionData({abi,functionName:'approve',args:[ROUTER,amount]}),value:'0x0',chainId:'0x4c18',expiresAt:Date.now()+60_000}};
 }
 requireThat(r.status==='prepared' && same(r.recipient,account));
 const expires=Date.parse(text(r.expiresAt));requireThat(expires>Date.now() && expires<=Date.now()+15_000);
 let data:Hex, target:Address=ROUTER, value=BigInt(0),title='Review swap';const lines:string[]=[];
 if(intent.kind==='wrap'||intent.kind==='unwrap') {
  target=WQMS;value=intent.kind==='wrap'?uint(intent.amount):BigInt(0);
  requireThat(r.operation===intent.kind && r.amountIn===intent.amount && r.amountOut===intent.amount && same(r.tokenIn,intent.kind==='wrap'?NATIVE:WQMS) && same(r.tokenOut,intent.kind==='wrap'?WQMS:NATIVE));
  data=intent.kind==='wrap'?encodeFunctionData({abi,functionName:'deposit'}):encodeFunctionData({abi,functionName:'withdraw',args:[uint(intent.amount)]});
  title=intent.kind==='wrap'?'Wrap QMS':'Unwrap WQMS';lines.push(quantity(intent.amount,intent.kind==='wrap'?'QMS':'WQMS'),'1:1 conversion. No swap fee. Network gas applies.','Wrapper transactions have no on-chain deadline.');
 } else {
  const deadline=uint(r.deadline);requireThat(deadline>BigInt(Math.floor(Date.now()/1000)) && deadline<=BigInt(Math.floor(Date.now()/1000)+125));
  if(intent.kind==='swap') {
   const q=intent.quote;requireThat(r.amountIn===q.amountIn && uint(r.minimumAmountOut)>=uint(q.minimumAmountOut) && uint(r.quotedAmountOut)>=uint(r.minimumAmountOut));
   requireThat(Array.isArray(r.path) && r.path.length===q.path.length && r.path.every((v,i)=>same(v,q.path[i])) && Array.isArray(r.pools) && r.pools.length===q.pools.length && r.pools.every((v,i)=>same(v,q.pools[i])));
   const minimum=uint(r.minimumAmountOut),amount=uint(q.amountIn);
   value=q.tokenIn==='QMS'?amount:BigInt(0);
   data=q.tokenIn==='QMS'?encodeFunctionData({abi,functionName:'swapExactETHForTokens',args:[minimum,q.path,account,deadline]}):encodeFunctionData({abi,functionName:q.tokenOut==='QMS'?'swapExactTokensForETH':'swapExactTokensForTokens',args:[amount,minimum,q.path,account,deadline]});
   lines.push(`Pay ${quantity(q.amountIn,q.tokenIn)}`,`Estimated receive ${quantity(text(r.quotedAmountOut),q.tokenOut)}`,`Minimum receive ${quantity(text(r.minimumAmountOut),q.tokenOut)}`,`Route: ${q.venueName}`);
  } else {
   requireThat(same(r.pool,intent.pool));
   const token0=addr(object(r.token0).address),token1=addr(object(r.token1).address);
   const forward=same(token0,addressOf(intent.tokenA));requireThat(forward?same(token1,addressOf(intent.tokenB)):same(token0,addressOf(intent.tokenB))&&same(token1,addressOf(intent.tokenA)));
   const symbols:[Token,Token]=forward?[intent.tokenA,intent.tokenB]:[intent.tokenB,intent.tokenA];
   const min0=uint(r.minimumAmount0),min1=uint(r.minimumAmount1),expected0=uint(r.amount0),expected1=uint(r.amount1);
   requireThat(min0>BigInt(0)&&min1>BigInt(0)&&expected0>=min0&&expected1>=min1);
   if(intent.kind==='add') {
    const desired0=uint(forward?intent.amountA:intent.amountB),desired1=uint(forward?intent.amountB:intent.amountA);
    requireThat(uint(r.amount0Desired)===desired0&&uint(r.amount1Desired)===desired1&&expected0<=desired0&&expected1<=desired1&&min0===expected0*BigInt(10000-intent.slippageBps)/BigInt(10000)&&min1===expected1*BigInt(10000-intent.slippageBps)/BigInt(10000)&&uint(r.estimatedLiquidity)>BigInt(0));
    data=encodeFunctionData({abi,functionName:'addLiquidity',args:[token0,token1,desired0,desired1,min0,min1,account,deadline]});title='Add liquidity';
    lines.push(`Maximum ${quantity(desired0.toString(),symbols[0])}`,`Maximum ${quantity(desired1.toString(),symbols[1])}`,`Expected deposit ${quantity(expected0.toString(),symbols[0])} + ${quantity(expected1.toString(),symbols[1])}`,'Minimum minted LP shares are not enforced by this router.');
   } else {
    requireThat(r.liquidity===intent.amountA);data=encodeFunctionData({abi,functionName:'removeLiquidity',args:[token0,token1,uint(intent.amountA),min0,min1,account,deadline]});title='Remove liquidity';
    lines.push(`Burn ${intent.amountA} LP base units`);
   }
   lines.push(`Minimum ${quantity(min0.toString(),symbols[0])}`,`Minimum ${quantity(min1.toString(),symbols[1])}`);
  }
 }
 const tx=object(r.transaction);requireThat(tx.chainId===19480 && same(tx.from,account)&&same(tx.to,target)&&same(tx.data,data)&&uint(tx.value)===value);
 const gas=uint(tx.gas);requireThat(gas>BigInt(0)&&gas<=BigInt(6_500_000));
 const price=tx.gasPrice===undefined?undefined:uint(tx.gasPrice);requireThat(price===undefined||price>BigInt(0));
 if(price)lines.push(`Maximum gas cost ${quantity((gas*price).toString(),'QMS')}`); else lines.push('Network fee is estimated again in your wallet.');
 return {approval:false,title,lines,addresses,pool,transaction:{from:account,to:target,data,value:hex(value),chainId:'0x4c18',gas:hex(gas),...(price?{gasPrice:hex(price)}:{}),expiresAt:expires}};
}
