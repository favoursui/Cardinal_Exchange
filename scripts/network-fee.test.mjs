import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../src/app/api/network-fee/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function harness({chainId = '0x4c18', price = '0x3b9aca00'} = {}) {
  const exports = {};
  let calls = 0, now = 0;
  runInNewContext(code, { exports, require: () => ({ qmsWalletChain: () => ({chainId: '0x4c18', rpcUrls: ['https://rpc.example']}) }), AbortSignal, Response, Date: {now: () => now}, fetch: async (_url, options) => {
    calls++;
    const {method, id} = JSON.parse(options.body);
    return Response.json({jsonrpc: '2.0', id, result: method === 'eth_chainId' ? chainId : price});
  }});
  return {get: exports.GET, get calls(){return calls;}, advance(ms){now += ms;}};
}
test('loads gas without wallet or amount, shares concurrent reads and refreshes after 30 seconds', async () => {
  const h = harness();
  const [a,b] = await Promise.all([h.get(), h.get()]);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.deepEqual(await a.json(), {gasPrice: '1000000000'});
  assert.equal(h.calls, 2);
  await h.get(); assert.equal(h.calls, 2);
  h.advance(30001); await h.get(); assert.equal(h.calls, 4);
});
test('rejects wrong networks and invalid gas prices', async () => {
  for (const config of [{chainId:'0x1'}, {price:'0x0'}, {price:'bad'}]) {
    const response = await harness(config).get();
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {error:'NETWORK_FEE_UNAVAILABLE'});
  }
});
