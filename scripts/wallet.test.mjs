import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
// Transpile the dependency-free controller in memory with the project's own TS compiler.
const source = readFileSync(new URL('../src/features/wallet/controller.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
const compiled = { exports: {} };
new Function('module', 'exports', 'require', output)(compiled, compiled.exports, createRequire(import.meta.url));
const { WalletController, QMS_CHAIN_ID } = compiled.exports;
const address = '0x1111111111111111111111111111111111111111';
const other = '0x2222222222222222222222222222222222222222';
const chain = { chainId: QMS_CHAIN_ID, chainName: 'QMS Testnet', nativeCurrency: {name: 'QMS', symbol: 'QMS', decimals: 18}, rpcUrls: ['https://rpc.testnet.qms.finance'], blockExplorerUrls: ['https://testnet.qmsscan.io'] };
class Provider {
  events = new Map(); calls = []; account = address; chainId = QMS_CHAIN_ID; handlers = {};
  on(event, listener) { const set = this.events.get(event) ?? new Set(); set.add(listener); this.events.set(event, set); }
  removeListener(event, listener) { this.events.get(event)?.delete(listener); }
  emit(event, value) { for (const listener of this.events.get(event) ?? []) listener(value); }
  async request(args) {
    this.calls.push(args);
    if (this.handlers[args.method]) return this.handlers[args.method](args);
    if (args.method === 'eth_accounts' || args.method === 'eth_requestAccounts') return [this.account];
    if (args.method === 'eth_chainId') return this.chainId;
    throw new Error('Unexpected method');
  }
}
const option = provider => ({id: 'wallet', name: 'Test wallet', provider});
const tick = () => new Promise(resolve => setImmediate(resolve));

test('connection reads account and chain, never signs; account/network events update both', async () => {
  const c = new WalletController(), p = new Provider();
  assert.equal(c.getSnapshot().account, null);
  assert.deepEqual(p.calls, []);
  await c.connect(option(p));
  assert.equal(c.getSnapshot().account, address);
  assert.equal(c.getSnapshot().chainId, QMS_CHAIN_ID);
  assert.deepEqual(p.calls.map(c => c.method), ['eth_requestAccounts','eth_accounts','eth_chainId']);
  p.emit('accountsChanged',[other]); p.emit('chainChanged','0x1');
  assert.equal(c.getSnapshot().account,other); assert.equal(c.getSnapshot().chainId,'0x1');
  p.emit('accountsChanged',[]);
  assert.equal(c.getSnapshot().account,null);
  assert.equal([...p.events.values()].reduce((n,s)=>n+s.size,0),0);
});
test('rejection and pending wallet request produce recoverable messages', async () => {
  for (const code of [4001,-32002]) {
    const c=new WalletController(), p=new Provider();
    p.handlers.eth_requestAccounts=()=>{throw {code};};
    await c.connect(option(p));
    assert.equal(c.getSnapshot().busy,false); assert.equal(c.getSnapshot().account,null);
    assert.match(c.getSnapshot().error, code===4001 ? /declined/ : /pending/);
  }
});
test('disconnect cancels stale connection results and duplicate clicks do not reprompt', async () => {
  const c=new WalletController(), p=new Provider(); let resolve;
  p.handlers.eth_requestAccounts=()=>new Promise(r=>{resolve=r;});
  const pending=c.connect(option(p)); await c.connect(option(p));
  assert.equal(p.calls.length,1);
  c.disconnect(); resolve([address]); await pending;
  assert.equal(c.getSnapshot().account,null); assert.equal(c.getSnapshot().busy,false);
});
test('provider events take precedence over a stale account/chain snapshot', async () => {
  const c=new WalletController(), p=new Provider(); let accounts, network;
  p.handlers.eth_accounts=()=>new Promise(r=>{accounts=r;});
  p.handlers.eth_chainId=()=>new Promise(r=>{network=r;});
  const pending=c.connect(option(p)); await tick();
  p.emit('accountsChanged',[other]); p.emit('chainChanged','0x1');
  accounts([address]); network(QMS_CHAIN_ID); await pending;
  assert.equal(c.getSnapshot().account,other); assert.equal(c.getSnapshot().chainId,'0x1');
});
test('unknown chain is added then explicitly switched and verified', async () => {
  const c=new WalletController(), p=new Provider(); p.chainId='0x1'; let switches=0;
  p.handlers.wallet_switchEthereumChain=()=>{if (++switches===1) throw {code:4902}; p.chainId=QMS_CHAIN_ID; p.emit('chainChanged',QMS_CHAIN_ID); return null;};
  p.handlers.wallet_addEthereumChain=()=>null;
  await c.connect(option(p)); await c.switchNetwork(chain);
  assert.equal(c.getSnapshot().chainId,QMS_CHAIN_ID); assert.equal(c.getSnapshot().busy,false);
  assert.equal(switches,2);
  assert.deepEqual(p.calls.find(c=>c.method==='wallet_addEthereumChain').params,[chain]);
});
test('a rejected network switch does not add a chain or claim the correct network', async () => {
  const c=new WalletController(), p=new Provider(); p.chainId='0x1';
  p.handlers.wallet_switchEthereumChain=()=>{throw {code:4001};};
  await c.connect(option(p)); await c.switchNetwork(chain);
  assert.equal(c.getSnapshot().chainId,'0x1'); assert.match(c.getSnapshot().error,/declined/);
  assert.equal(p.calls.some(c=>c.method==='wallet_addEthereumChain'),false);
});
test('provider disconnect clears state and a former wallet cannot change the new connection', async () => {
  const c=new WalletController(), p=new Provider(), next=new Provider(); next.account=other;
  await c.connect(option(p)); p.emit('disconnect',{});
  assert.equal(c.getSnapshot().account,null);
  await c.connect(option(next)); p.emit('accountsChanged',[address]);
  assert.equal(c.getSnapshot().account,other);
});
test('invalid wallet account and chain data fail closed', async () => {
  for(const property of ['account','chainId']) {
    const c=new WalletController(), p=new Provider(); p[property]='invalid';
    await c.connect(option(p));
    assert.equal(c.getSnapshot().account,null); assert.equal(c.getSnapshot().busy,false); assert.ok(c.getSnapshot().error);
  }
});
