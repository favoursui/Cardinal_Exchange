import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/features/history/store.ts',import.meta.url),'utf8');
const compiled={exports:{}};
new Function('module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(compiled,compiled.exports);
const {readHistory,saveTransaction,parseStatus,statusLabels}=compiled.exports;
const account='0x'+'ab'.repeat(20), other='0x'+'cd'.repeat(20), hash='0x'+'11'.repeat(32);
const storage=()=>({data:new Map(),getItem(key){return this.data.get(key)??null;},setItem(key,value){this.data.set(key,value);}});
test('history persists, deduplicates hashes and isolates wallets with case normalization',()=>{
 const s=storage(); saveTransaction(s,account,hash); saveTransaction(s,account.toUpperCase().replace('0X','0x'),hash);
 assert.equal(readHistory(s,account).length,1); assert.equal(readHistory(s,other).length,0);
 assert.ok([...s.data.keys()][0].includes(':19480:'));
});
test('history keeps only the latest twenty hashes and rejects invalid input',()=>{
 const s=storage(); for(let i=1;i<=25;i++)saveTransaction(s,account,'0x'+i.toString(16).padStart(64,'0'));
 assert.equal(readHistory(s,account).length,20); assert.equal(readHistory(s,account)[0].hash,'0x'+(25).toString(16).padStart(64,'0'));
 assert.throws(()=>saveTransaction(s,account,'invalid')); assert.throws(()=>readHistory(s,'invalid'));
});
test('malformed or inaccessible storage fails visibly instead of silently claiming history was saved',()=>{
 const s=storage(); saveTransaction(s,account,hash); s.data.set([...s.data.keys()][0],'{'); assert.throws(()=>readHistory(s,account));
 const denied={getItem(){return null;},setItem(){throw new Error('quota');}}; assert.throws(()=>saveTransaction(denied,account,hash));
});
test('status decoding handles all backend states and rejects another hash or chain',()=>{
 const base={hash,chainId:19480,confirmations:'0',requiredConfirmations:'3',observedAt:new Date().toISOString()};
 for(const status of Object.keys(statusLabels))assert.equal(parseStatus({...base,status},hash).status,status);
 for(const patch of [{chainId:1},{hash:'0x'+'22'.repeat(32)},{status:'success'},{confirmations:'NaN'},{observedAt:'invalid'}])assert.throws(()=>parseStatus({...base,status:'pending',...patch},hash));
});
