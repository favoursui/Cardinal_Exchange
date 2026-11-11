import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const code=ts.transpileModule(readFileSync(new URL('../src/features/swap/use-route-quote.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness({fail=false,connected=true}={}) {
 let now=0,id=0,effect,state,calls=0,signal;
 const timers=new Map(),listeners=new Map();
 const document={visibilityState:'visible',addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 const compiled={exports:{}};
 const dependencies={
  react:{useEffect:fn=>{effect=fn;},useState:initial=>[initial,value=>{state=value;}]},
  '@/lib/config/tokens':{tokenMetadata:{QMS:{address:'native',decimals:18},USDC:{address:'usdc',decimals:6}}},
  '@/features/trading/api':{api:async(_path,_body,s)=>{calls++;signal=s;if(fail)throw new Error('Unavailable');return {quotes:[{quoteId:String(calls),venue:'qwap',amountOut:'100',expiresAt:new Date(now+1000).toISOString()}]};}},
  '@/features/trading/validation':{parseQuote:q=>q},
 };
 runInNewContext(code,{exports:compiled.exports,require:name=>dependencies[name],AbortController,document,Date:{now:()=>now,parse:Date.parse},setTimeout:(fn,delay)=>{const key=++id;timers.set(key,{fn,at:now+delay});return key;},clearTimeout:key=>timers.delete(key)});
 const result=compiled.exports.useRouteQuote('QMS','USDC','1','0.5',false,connected);
 const cleanup=effect()??(()=>{});
 const advance=async ms=>{
  const end=now+ms;
  for(;;){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();await Promise.resolve();await Promise.resolve();}
  now=end;
 };
 return {advance,cleanup,result,get calls(){return calls;},get state(){return state;},get signal(){return signal;},visibility(value){document.visibilityState=value;listeners.get('visibilitychange')?.();},get listeners(){return listeners.size;}};
}
test('refreshes expired quotes, pauses in hidden tabs, resumes and cleans up',async()=>{
 const h=harness();await h.advance(399);assert.equal(h.calls,0);
 await h.advance(1);assert.equal(h.calls,1);assert.equal(h.state.quotes[0].quoteId,'1');
 await h.advance(1000);assert.equal(h.calls,2);assert.equal(h.state.quotes[0].quoteId,'2');
 h.visibility('hidden');await h.advance(5000);assert.equal(h.calls,2);assert.equal(h.state.quotes.length,0);
 h.visibility('visible');await h.advance(0);assert.equal(h.calls,3);
 h.cleanup();assert.equal(h.signal.aborted,true);assert.equal(h.listeners,0);await h.advance(30000);assert.equal(h.calls,3);
});
test('failed quotes retry after 15 seconds rather than looping',async()=>{
 const h=harness({fail:true});await h.advance(400);assert.equal(h.calls,1);assert.equal(h.state.quotes.length,0);
 await h.advance(14999);assert.equal(h.calls,1);await h.advance(1);assert.equal(h.calls,2);h.cleanup();
});

test('does not fetch or schedule quotes while the wallet is disconnected',async()=>{
 const h=harness({connected:false});
 assert.equal(h.result.enabled,false);
 assert.equal(h.result.status,'Connect wallet for quotes');
 assert.equal(h.result.quotes.length,0);
 await h.advance(60000);
 assert.equal(h.calls,0);
 assert.equal(h.listeners,0);
 h.visibility('visible');await h.advance(1000);assert.equal(h.calls,0);
 h.cleanup();
});
