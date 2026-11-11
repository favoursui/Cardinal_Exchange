import type { NextRequest } from 'next/server';

export const runtime='nodejs';
export const dynamic='force-dynamic';
async function proxy(request:NextRequest,{params}:{params:Promise<{action:string}>}) {
 const {action}=await params;
 if(!['challenge','verify','session','logout'].includes(action)||(request.method==='GET')!==(action==='session'))return Response.json({error:'NOT_FOUND'},{status:404});
 const origin=process.env.AUTH_ORIGIN;
 const base=process.env.AUTH_API_BASE_URL??process.env.NEXT_PUBLIC_API_BASE_URL;
 if(!origin||!base)return Response.json({error:'SIGN_IN_NOT_CONFIGURED'},{status:503});
 if(request.method==='POST'&&request.headers.get('origin')!==origin)return Response.json({error:'ORIGIN_REJECTED'},{status:403});
 if(request.headers.get('sec-fetch-site')==='cross-site')return Response.json({error:'ORIGIN_REJECTED'},{status:403});
 try {
  const headers=new Headers({Origin:origin});
  // Forward only authentication cookies, never unrelated application cookies.
  const cookies=(request.headers.get('cookie')??'').split(';').map(v=>v.trim()).filter(v=>/^(?:__Host-)?cadinal-(?:session|challenge)=/.test(v));
  if(cookies.length)headers.set('Cookie',cookies.join('; '));
  let body:string|undefined;
  if(request.method==='POST'){
   if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'INVALID_CONTENT_TYPE'},{status:415});
   body=await request.text();if(body.length>4096)return Response.json({error:'REQUEST_TOO_LARGE'},{status:413});headers.set('Content-Type','application/json');
  }
  const response=await fetch(`${base.replace(/\/$/,'')}/v1/auth/${action}`,{method:request.method,headers,body,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
  const outgoing=new Headers({'Content-Type':'application/json','Cache-Control':'no-store'});
  for(const cookie of response.headers.getSetCookie())outgoing.append('Set-Cookie',cookie);
  return new Response(await response.text(),{status:response.status,headers:outgoing});
 }catch{return Response.json({error:'SIGN_IN_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
export const GET=proxy;
export const POST=proxy;
