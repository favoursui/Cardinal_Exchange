// Local-only: the transaction endpoint is fixed to localhost and must identify as an Anvil QMS fork.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {createPublicClient,defineChain,http,erc20Abi,getAddress} from 'viem';
import {loadTS} from './load-ts.mjs';
const backend=process.env.CARDINAL_BACKEND_DIR;
if(!backend)throw new Error('Set CARDINAL_BACKEND_DIR to the built backend directory.');
const backendModule=path=>import(pathToFileURL(resolve(backend,'dist/apps/api/src',path)).href);
const {buildApp}=await backendModule('app.js');
const {QwapQuotes,createQwapReader}=await backendModule('adapters/qwap.js');
const {createExecutionReader}=await backendModule('services/prepare-swap.js');
const {createNativeReader}=await backendModule('services/prepare-native.js');
const {createAdditionReader}=await backendModule('services/prepare-addition.js');
const {createRemovalReader}=await backendModule('services/prepare-removal.js');
const {createStatusReader,TransactionTracker}=await backendModule('services/transaction-status.js');
const {WalletController}=loadTS('src/features/wallet/controller.ts');
const {parseQuote,requestFor,validatePreparation}=loadTS('src/features/trading/validation.ts');
const {tokenMetadata}=loadTS('src/lib/config/tokens.ts');
const {saveTransaction,readHistory}=loadTS('src/features/history/store.ts');
const url='http://127.0.0.1:18546';
const chain=defineChain({id:19480,name:'Local QMS fork',nativeCurrency:{name:'QMS',symbol:'QMS',decimals:18},rpcUrls:{default:{http:[url]}}});
const client=createPublicClient({chain,transport:http(url,{timeout:60_000,retryCount:0}),cacheTime:0});
assert.match(await client.request({method:'web3_clientVersion'}),/^anvil\//);
const meta=await client.request({method:'anvil_metadata'});assert.equal(meta.chainId,19480);assert.equal(meta.forkedNetwork?.chainId,19480);
const account=getAddress((await client.request({method:'eth_accounts'}))[0]);
const snapshot=await client.request({method:'evm_snapshot'});let app;
const memory={data:new Map(),getItem(k){return this.data.get(k)??null},setItem(k,v){this.data.set(k,v)}};
const wallet=new WalletController();
await wallet.connect({id:'local',name:'Local test wallet',provider:{on(){},removeListener(){},request:args=>args.method==='eth_requestAccounts'||args.method==='eth_accounts'?Promise.resolve([account]):client.request(args)}});
const balance=token=>client.readContract({address:tokenMetadata[token].address,abi:erc20Abi,functionName:'balanceOf',args:[account]});
const runs=[];
try {
 const source=await client.getBlock();
 await client.request({method:'evm_setNextBlockTimestamp',params:[Math.max(Math.floor(Date.now()/1000),Number(source.timestamp)+1)]});await client.request({method:'evm_mine'});
 const rpc=createQwapReader(client),quotes=new QwapQuotes(rpc);
 // Warm fork state so the first preparation is not spent downloading remote trie data.
 const {codeHashes}=loadTS('src/features/trading/contracts.ts');await Promise.all(Object.keys(codeHashes).map(address=>client.getCode({address})));
 await quotes.pool(tokenMetadata.WQMS.address,tokenMetadata.USDC.address,account);
 app=await buildApp({rateLimitMax:1000,quotes,wallets:[quotes],pools:[quotes],execution:createExecutionReader(client),nativeExecution:createNativeReader(client),additionExecution:createAdditionReader(client),removalExecution:createRemovalReader(client),tracker:new TransactionTracker(createStatusReader(client))});
 let requests=0;
 const post=async(url,payload)=>{const r=await app.inject({method:'POST',url,payload,remoteAddress:`127.0.0.${1+(requests++%200)}`});assert.equal(r.statusCode,200,`${url}: ${r.body}`);return r.json();};
 const quote=async(input,output,amount)=>parseQuote((await post('/v1/quotes',{chainId:19480,tokenIn:tokenMetadata[input].address,tokenOut:tokenMetadata[output].address,amountIn:amount,slippageBps:50})).quotes[0],input,output,amount,50);
 const execute=async(getIntent)=>{
  for(let i=0;i<5;i++){
   const intent=await getIntent(),request=requestFor(intent,account),raw=await post(request.path,request.body),review=validatePreparation(raw,intent,account);
   const hash=await wallet.sendTransaction(review.transaction);saveTransaction(memory,account,hash);
   const receipt=await client.waitForTransactionReceipt({hash,timeout:60_000,pollingInterval:100});assert.equal(receipt.status,'success');
   await client.request({method:'anvil_mine',params:['0x2']});
   const status=await app.inject(`/v1/transactions/${hash}`);assert.equal(status.json().status,'confirmed');
   if(!review.approval){runs.push(intent.kind);return {raw,receipt};}
  }
  throw new Error('Approval flow did not converge');
 };
 const wrappedBefore=await balance('WQMS');await execute(async()=>({kind:'wrap',amount:'2000000000000000000'}));assert.equal(await balance('WQMS')-wrappedBefore,2000000000000000000n);
 await execute(async()=>({kind:'unwrap',amount:'100000000000000000'}));
 const usdcBefore=await balance('USDC');await execute(async()=>({kind:'swap',quote:await quote('QMS','USDC','100000000000000000')}));const received=await balance('USDC')-usdcBefore;assert.ok(received>0n);
 await execute(async()=>({kind:'swap',quote:await quote('USDC','QMS',(received/4n).toString())}));
 await execute(async()=>({kind:'swap',quote:await quote('WQMS','USDC','10000000000000000')}));
 const pool=await quotes.pool(tokenMetadata.WQMS.address,tokenMetadata.USDC.address,account);
 const lpBefore=BigInt(pool.position.lpBalance);
 await execute(async()=>({kind:'add',tokenA:'WQMS',tokenB:'USDC',amountA:'10000000000000000',amountB:(received/4n).toString(),slippageBps:50,pool:pool.pool}));
 const after=await quotes.pool(tokenMetadata.WQMS.address,tokenMetadata.USDC.address,account);assert.ok(BigInt(after.position.lpBalance)>lpBefore);
 await execute(async()=>({kind:'remove',tokenA:'WQMS',tokenB:'USDC',amountA:after.position.lpBalance,amountB:'0',slippageBps:50,pool:pool.pool}));
 const final=await quotes.pool(tokenMetadata.WQMS.address,tokenMetadata.USDC.address,account);assert.equal(final.position.lpBalance,'0');
 assert.ok(readHistory(memory,account).length>=runs.length);
 const evidence={checkedAt:new Date().toISOString(),sourceBlock:String(source.number),publicTransactions:false,runs,recordedHashes:readHistory(memory,account).length};
 await writeFile('/tmp/cardinal-trading-fork-evidence.json',JSON.stringify(evidence,null,2)+'\n');
 console.log('Trading fork passed:',JSON.stringify(evidence));
} finally {await app?.close();assert.equal(await client.request({method:'evm_revert',params:[snapshot]}),true);}
