import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionData,decodeFunctionData} from 'viem';
import {loadTS} from './load-ts.mjs';
const {parseQuote,validatePreparation}=loadTS('src/features/trading/validation.ts');
const {abi,ROUTER,WQMS,NATIVE}=loadTS('src/features/trading/contracts.ts');
const {tokenMetadata}=loadTS('src/lib/config/tokens.ts');
const {WalletController}=loadTS('src/features/wallet/controller.ts');
const account='0x1111111111111111111111111111111111111111',other='0x2222222222222222222222222222222222222222';
const pool='0x3333333333333333333333333333333333333333',usdc=tokenMetadata.USDC.address;
const fresh=()=>new Date(Date.now()+14_000).toISOString();
function quote(input='WQMS',output='USDC') {
 return parseQuote({chainId:19480,venue:'qwap',venueName:'QWAP',router:ROUTER,tokenIn:tokenMetadata[input].address,tokenOut:tokenMetadata[output].address,amountIn:'1000',amountOut:'2000',minimumAmountOut:'1990',slippageBps:50,path:[input==='QMS'?WQMS:tokenMetadata[input].address,output==='QMS'?WQMS:tokenMetadata[output].address],pools:[pool],quoteId:'11111111-1111-4111-8111-111111111111',expiresAt:fresh()},input,output,'1000',50);
}
function swap(input='WQMS',output='USDC') {
 const q=quote(input,output),deadline=BigInt(Math.floor(Date.now()/1000)+120);
 const data=input==='QMS'?encodeFunctionData({abi,functionName:'swapExactETHForTokens',args:[1990n,q.path,account,deadline]}):encodeFunctionData({abi,functionName:output==='QMS'?'swapExactTokensForETH':'swapExactTokensForTokens',args:[1000n,1990n,q.path,account,deadline]});
 return {intent:{kind:'swap',quote:q},response:{status:'prepared',chainId:19480,venue:'qwap',quoteId:q.quoteId,recipient:account,amountIn:'1000',minimumAmountOut:'1990',quotedAmountOut:'2000',path:q.path,pools:q.pools,deadline:String(deadline),expiresAt:fresh(),transaction:{chainId:19480,from:account,to:ROUTER,data,value:input==='QMS'?'1000':'0',gas:'200000'}}};
}
test('swap validator binds native and ERC20 payloads to the reviewed intent',()=>{
 for(const [input,output] of [['WQMS','USDC'],['QMS','USDC'],['USDC','QMS']]) {
  const {intent,response}=swap(input,output),review=validatePreparation(response,intent,account);
  assert.equal(review.transaction.value,input==='QMS'?'0x3e8':'0x0');assert.equal(review.approval,false);
 }
});
test('tampered destination, recipient, calldata, value, minima, route, chain and expiry fail closed',()=>{
 const {intent,response}=swap();
 const changes=[r=>r.transaction.to=other,r=>r.recipient=other,r=>r.transaction.data='0x',r=>r.transaction.value='1',r=>r.minimumAmountOut='1',r=>r.path=[other,usdc],r=>r.chainId=1,r=>r.expiresAt=new Date(0).toISOString(),r=>r.transaction.from=other,r=>r.cardinalFee={}];
 for(const change of changes){const altered=structuredClone(response);change(altered);assert.throws(()=>validatePreparation(altered,intent,account));}
});
test('approvals bind exact amount and router; reset is a separate zero approval',()=>{
 const q=quote();const response={status:'approval_required',chainId:19480,venue:'qwap',quoteId:q.quoteId,token:WQMS,owner:account,spender:ROUTER,amount:'1000',currentAllowance:'0',resetAllowanceFirst:false};
 const intent={kind:'swap',quote:q};
 let review=validatePreparation(response,intent,account);assert.equal(decodeFunctionData({abi,data:review.transaction.data}).args[1],1000n);
 review=validatePreparation({...response,currentAllowance:'50',resetAllowanceFirst:true},intent,account);assert.equal(decodeFunctionData({abi,data:review.transaction.data}).args[1],0n);
 for(const change of [{spender:other},{amount:'999999'},{owner:other},{token:usdc}])assert.throws(()=>validatePreparation({...response,...change},intent,account));
});
test('wrap and unwrap are bound to the wrapper, exact value, and amount',()=>{
 for(const kind of ['wrap','unwrap']) {
  const intent={kind,amount:'1000'},data=encodeFunctionData({abi,functionName:kind==='wrap'?'deposit':'withdraw',...(kind==='wrap'?{}:{args:[1000n]})});
  const response={status:'prepared',chainId:19480,operation:kind,recipient:account,amountIn:'1000',amountOut:'1000',tokenIn:kind==='wrap'?NATIVE:WQMS,tokenOut:kind==='wrap'?WQMS:NATIVE,expiresAt:fresh(),transaction:{chainId:19480,from:account,to:WQMS,value:kind==='wrap'?'1000':'0',data,gas:'80000'}};
  assert.equal(validatePreparation(response,intent,account).transaction.to,WQMS);
  assert.throws(()=>validatePreparation({...response,amountOut:'999'},intent,account));
 }
});
test('liquidity validates deposit caps, withdrawal amount, pool and minima',()=>{
 const deadline=BigInt(Math.floor(Date.now()/1000)+120);
 for(const kind of ['add','remove']) {
  const intent={kind,tokenA:'WQMS',tokenB:'USDC',amountA:'1000',amountB:'2000',slippageBps:50,pool};
  const data=encodeFunctionData({abi,functionName:kind==='add'?'addLiquidity':'removeLiquidity',args:kind==='add'?[WQMS,usdc,1000n,2000n,995n,1990n,account,deadline]:[WQMS,usdc,1000n,995n,1990n,account,deadline]});
  const response={status:'prepared',chainId:19480,venue:'qwap',recipient:account,pool,token0:{address:WQMS},token1:{address:usdc},amount0:'1000',amount1:'2000',minimumAmount0:'995',minimumAmount1:'1990',amount0Desired:'1000',amount1Desired:'2000',estimatedLiquidity:'50',liquidity:'1000',deadline:String(deadline),expiresAt:fresh(),transaction:{chainId:19480,from:account,to:ROUTER,value:'0',gas:'200000',data}};
  assert.equal(validatePreparation(response,intent,account).approval,false);
  assert.throws(()=>validatePreparation({...response,pool:other},intent,account));
  assert.throws(()=>validatePreparation({...response,minimumAmount0:'0'},intent,account));
 }
});
function provider() {
 return {calls:[],on(){},removeListener(){},chain:'0x4c18',account,balance:'0x10000000000000000',async request(args){this.calls.push(args);switch(args.method){case 'eth_requestAccounts':case 'eth_accounts':return [this.account];case 'eth_chainId':return this.chain;case 'eth_call':return '0x';case 'eth_estimateGas':return '0x5208';case 'eth_gasPrice':return '0x1';case 'eth_getBalance':return this.balance;case 'eth_sendTransaction':return '0x'+'ab'.repeat(32);default:throw new Error('Unexpected method');}}};
}
async function connected(){const c=new WalletController(),p=provider();await c.connect({id:'test',name:'Test',provider:p});return {c,p};}
const transaction=()=>({chainId:'0x4c18',from:account,to:ROUTER,data:'0x1234',value:'0x0',expiresAt:Date.now()+15_000});
test('wallet preflights and sends only explicit transaction fields',async()=>{
 const {c,p}=await connected();const hash=await c.sendTransaction({...transaction(),unexpected:'discard'});assert.match(hash,/^0x[0-9a-f]{64}$/);
 const tx=p.calls.find(c=>c.method==='eth_sendTransaction').params[0];assert.equal(tx.unexpected,undefined);assert.equal(tx.from,account);assert.equal(tx.chainId,'0x4c18');assert.ok(tx.gas&&tx.gasPrice);
});
test('wrong chain/account, expired review, or insufficient native gas prevents submission',async()=>{
 for(const alter of [(p)=>p.chain='0x1',(p)=>p.account=other,(p,tx)=>tx.expiresAt=0,(p)=>p.balance='0x0']) {
  const {c,p}=await connected(),tx=transaction();alter(p,tx);await assert.rejects(c.sendTransaction(tx));assert.equal(p.calls.some(c=>c.method==='eth_sendTransaction'),false);
 }
});
