import assert from 'node:assert/strict';
import {test} from 'node:test';
import {loadTS} from './load-ts.mjs';
const {POST,GET}=loadTS('src/app/api/auth/[action]/route.ts');
const origin='https://cardinal.example';
const context=action=>({params:Promise.resolve({action})});
test('auth proxy rejects untrusted origins and paths before contacting the API',async()=>{
 const previous={origin:process.env.AUTH_ORIGIN,base:process.env.AUTH_API_BASE_URL,fetch:globalThis.fetch};
 try{
  process.env.AUTH_ORIGIN=origin;process.env.AUTH_API_BASE_URL='https://api.example';let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('unexpected');};
  const post=(headers={})=>new Request(`${origin}/api/auth/challenge`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:'{}'});
  assert.equal((await POST(post({Origin:'https://evil.example'}),context('challenge'))).status,403);
  assert.equal((await POST(post(),context('verify'))).status,403);
  assert.equal((await POST(post({Origin:origin}),context('../anything'))).status,404);
  assert.equal((await GET(new Request(`${origin}/api/auth/session`,{headers:{'Sec-Fetch-Site':'cross-site'}}),context('session'))).status,403);
  assert.equal(calls,0);
 }finally{globalThis.fetch=previous.fetch;for(const [k,v] of [['AUTH_ORIGIN',previous.origin],['AUTH_API_BASE_URL',previous.base]]){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
test('auth proxy forwards only auth cookies and preserves HttpOnly Set-Cookie headers',async()=>{
 const previous={origin:process.env.AUTH_ORIGIN,base:process.env.AUTH_API_BASE_URL,fetch:globalThis.fetch};
 try{
  process.env.AUTH_ORIGIN=origin;process.env.AUTH_API_BASE_URL='https://api.example';
  globalThis.fetch=async(url,options)=>{
   assert.equal(url,'https://api.example/v1/auth/verify');assert.equal(options.headers.get('Origin'),origin);
   assert.equal(options.headers.get('Cookie'),'__Host-cardinal-challenge=abc');assert.equal(options.redirect,'error');
   const headers=new Headers({'Content-Type':'application/json'});headers.append('Set-Cookie','__Host-cardinal-session=secret; HttpOnly; Secure; SameSite=Lax; Path=/');headers.append('Set-Cookie','__Host-cardinal-challenge=; Max-Age=0; Path=/');
   return new Response('{}',{headers});
  };
  const response=await POST(new Request(`${origin}/api/auth/verify`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'other=private; __Host-cardinal-challenge=abc'},body:'{}'}),context('verify'));
  assert.equal(response.status,200);assert.equal(response.headers.getSetCookie().length,2);assert.equal(response.headers.get('Cache-Control'),'no-store');
 }finally{globalThis.fetch=previous.fetch;for(const [k,v] of [['AUTH_ORIGIN',previous.origin],['AUTH_API_BASE_URL',previous.base]]){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
