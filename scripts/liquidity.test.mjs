import assert from 'node:assert/strict';
import {test} from 'node:test';
import {encodeFunctionData} from 'viem';
import {loadTS} from './load-ts.mjs';
const config=loadTS('src/lib/config/cadinal-deployment.ts');
const {parseCatalog}=loadTS('src/features/liquidity/data.ts');
const {liquidityContracts}=loadTS('src/features/trading/liquidity-contracts.ts');
const {validatePreparation,requestFor}=loadTS('src/features/trading/validation.ts');
const {abi,ROUTER,FACTORY,WQMS}=loadTS('src/features/trading/contracts.ts');
const {tokenMetadata}=loadTS('src/lib/config/tokens.ts');
const usdc=tokenMetadata.USDC.address,account='0x1111111111111111111111111111111111111111',poolAddress='0x2222222222222222222222222222222222222222';
const deployment={chainId:19480,router:'0x3333333333333333333333333333333333333333',factory:'0x4444444444444444444444444444444444444444',routerHash:'0x'+'aa'.repeat(32),factoryHash:'0x'+'bb'.repeat(32)};
const token=t=>({address:tokenMetadata[t].address,symbol:t,decimals:tokenMetadata[t].decimals});
function pool(wallet=account){return {chainId:19480,venue:'cadinal',router:deployment.router,factory:deployment.factory,pool:poolAddress,token0:token('WQMS'),token1:token('USDC'),reserve0:'100000000000000000000',reserve1:'50000000',totalSupply:'100000000000000000000',poolFeeBps:30,observedAt:new Date().toISOString(),position:wallet?{wallet,lpBalance:'1000000000000000000',shareBps:'100',estimatedAmount0:'1000000000000000000',estimatedAmount1:'500000'}:null};}
function page(pools=[pool()]){return {chainId:19480,venue:'cadinal',configured:true,pools,partial:false,failures:[],checkedPairs:6,totalPairs:10,nextCursor:6};}
test('unconfigured own liquidity is empty and cannot fall back to QWAP',()=>{
 const result=parseCatalog({chainId:19480,venue:'cadinal',configured:false,pools:[],partial:false,failures:[],checkedPairs:0,totalPairs:0,nextCursor:null},null,0);
 assert.equal(result.configured,false);assert.equal(result.pools.length,0);
 assert.throws(()=>liquidityContracts('cadinal'));
 assert.throws(()=>parseCatalog(page(),account,0));
 assert.throws(()=>parseCatalog(page(),account,0,{...deployment,router:ROUTER,factory:FACTORY}));
});
test('catalog validates exact reserve shares and binds pool and wallet identities',()=>{
 const result=parseCatalog(page(),account,0,deployment);
 assert.equal(result.pools[0].amountA,'1000000000000000000');assert.equal(result.pools[0].amountB,'500000');
 assert.equal(result.pools[0].shareBps,'100');
 for(const mutate of [p=>p.venue='qwap',p=>p.router=ROUTER,p=>p.factory=FACTORY,p=>p.position.wallet=poolAddress,p=>p.position.lpBalance='999999999999999999999',p=>p.position.estimatedAmount0='999',p=>p.token0.decimals=6,p=>p.observedAt=new Date(0).toISOString()]){
  const value=pool();mutate(value);assert.throws(()=>parseCatalog(page([value]),account,0,deployment));
 }
 assert.equal(parseCatalog(page([pool(null)]),null,0,deployment).pools[0].lpBalance,null);
});
test('catalog preserves partial results and rejects incomplete or looping pagination',()=>{
 const partial={...page(),partial:true,failures:[{tokenA:WQMS,tokenB:usdc,error:'BLOCK_REORG'}]};
 assert.equal(parseCatalog(partial,account,0,deployment).partial,true);
 for(const patch of [{nextCursor:0},{nextCursor:null},{totalPairs:496},{partial:false,failures:[{}]}])assert.throws(()=>parseCatalog({...page(),...patch},account,0,deployment));
 assert.equal(parseCatalog({...page(),checkedPairs:4,nextCursor:null},account,6,deployment).nextCursor,null);
});
test('Cadinal deposits and approvals bind the selected router and reject external destinations',()=>{
 config.CADINAL_LIQUIDITY_DEPLOYMENT=deployment;
 try{
  const intent={kind:'add',venue:'cadinal',tokenA:'WQMS',tokenB:'USDC',amountA:'1000',amountB:'2000',slippageBps:50,pool:poolAddress};
  const deadline=BigInt(Math.floor(Date.now()/1000)+120);
  const data=encodeFunctionData({abi,functionName:'addLiquidity',args:[WQMS,usdc,1000n,2000n,995n,1990n,account,deadline]});
  const response={chainId:19480,venue:'cadinal',status:'prepared',recipient:account,pool:poolAddress,token0:token('WQMS'),token1:token('USDC'),amount0Desired:'1000',amount1Desired:'2000',amount0:'1000',amount1:'2000',minimumAmount0:'995',minimumAmount1:'1990',estimatedLiquidity:'100',deadline:deadline.toString(),expiresAt:new Date(Date.now()+14000).toISOString(),transaction:{chainId:19480,from:account,to:deployment.router,data,value:'0',gas:'200000'}};
  assert.equal(requestFor(intent,account).body.venue,'cadinal');
  assert.equal(validatePreparation(response,intent,account).transaction.to,deployment.router);
  assert.throws(()=>validatePreparation({...response,transaction:{...response.transaction,to:ROUTER}},intent,account));
  assert.throws(()=>validatePreparation({...response,venue:'qwap'},intent,account));
  const approval={chainId:19480,venue:'cadinal',status:'approval_required',token:WQMS,owner:account,spender:deployment.router,amount:'1000',currentAllowance:'0',resetAllowanceFirst:false};
  assert.equal(validatePreparation(approval,intent,account).approval,true);
  assert.throws(()=>validatePreparation({...approval,spender:ROUTER},intent,account));
  const pins=liquidityContracts('cadinal');assert.equal(pins.factory,deployment.factory);assert.equal(pins.hashes[ROUTER.toLowerCase()],undefined);
 }finally{config.CADINAL_LIQUIDITY_DEPLOYMENT=null;}
});

test('Cadinal withdrawals bind LP approval and reject weakened output protection',()=>{
 config.CADINAL_LIQUIDITY_DEPLOYMENT=deployment;
 try{
  const intent={kind:'remove',venue:'cadinal',tokenA:'WQMS',tokenB:'USDC',amountA:'1000',amountB:'0',slippageBps:50,pool:poolAddress};
  const deadline=BigInt(Math.floor(Date.now()/1000)+120);
  const calldata=(min0,min1)=>encodeFunctionData({abi,functionName:'removeLiquidity',args:[WQMS,usdc,1000n,min0,min1,account,deadline]});
  const response={chainId:19480,venue:'cadinal',status:'prepared',recipient:account,pool:poolAddress,token0:token('WQMS'),token1:token('USDC'),liquidity:'1000',amount0:'1000',amount1:'2000',minimumAmount0:'995',minimumAmount1:'1990',deadline:deadline.toString(),expiresAt:new Date(Date.now()+14000).toISOString(),transaction:{chainId:19480,from:account,to:deployment.router,data:calldata(995n,1990n),value:'0',gas:'200000'}};
  assert.equal(requestFor(intent,account).body.venue,'cadinal');
  assert.equal(validatePreparation(response,intent,account).transaction.to,deployment.router);
  assert.throws(()=>validatePreparation({...response,transaction:{...response.transaction,to:ROUTER}},intent,account));
  assert.throws(()=>validatePreparation({...response,venue:'qwap'},intent,account));
  for(const [min0,min1] of [[1n,1n],[994n,1990n],[995n,1989n]]){
   assert.throws(()=>validatePreparation({...response,minimumAmount0:String(min0),minimumAmount1:String(min1),transaction:{...response.transaction,data:calldata(min0,min1)}},intent,account));
  }
  // Reserve-derived minima may be stricter than the simulated return tolerance.
  assert.equal(validatePreparation({...response,minimumAmount0:'997',minimumAmount1:'1995',transaction:{...response.transaction,data:calldata(997n,1995n)}},intent,account).approval,false);
  const approval={chainId:19480,venue:'cadinal',status:'approval_required',token:poolAddress,owner:account,spender:deployment.router,amount:'1000',currentAllowance:'0',resetAllowanceFirst:false};
  assert.equal(validatePreparation(approval,intent,account).transaction.to,poolAddress);
  assert.throws(()=>validatePreparation({...approval,spender:ROUTER},intent,account));
  assert.throws(()=>validatePreparation({...approval,token:WQMS},intent,account));
 }finally{config.CADINAL_LIQUIDITY_DEPLOYMENT=null;}
});
