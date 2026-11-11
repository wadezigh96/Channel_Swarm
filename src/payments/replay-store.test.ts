import assert from "node:assert/strict";
import {test} from "node:test";
import {X402ReplayStore} from "./replay-store.js";
test("x402 replay store accepts atomic increasing vouchers with a full incremental payment",async()=>{
 const oldUrl=process.env.KV_REST_API_URL,oldToken=process.env.KV_REST_API_TOKEN,oldFetch=globalThis.fetch,oldVercel=process.env.VERCEL;
 process.env.KV_REST_API_URL="https://kv.example.test";process.env.KV_REST_API_TOKEN="test-token";delete process.env.VERCEL;
 const values=new Map<string,string>();
 globalThis.fetch=(async(_input,init)=>{
  const args=JSON.parse(String(init?.body)) as string[],key=args[3],candidate=BigInt(args[4]),minimum=BigInt(args[5]),prior=values.get(key);
  const accepted=prior===undefined?candidate>=minimum:candidate>BigInt(prior)&&candidate-BigInt(prior)>=minimum;
  if(accepted)values.set(key,candidate.toString());
  return new Response(JSON.stringify({result:accepted?1:(prior!==undefined&&candidate>BigInt(prior)?-1:0)}),{status:200});
 }) as typeof fetch;
 try{
  const store=new X402ReplayStore();
  assert.equal(await store.accept("channel-A",1000000n,1000000n),true);
  assert.equal(await store.accept("channel-A",1000000n,1000000n),false);
  assert.equal(await store.accept("channel-A",1000001n,1000000n),false);
  assert.equal(await store.accept("channel-A",1999999n,1000000n),false);
  assert.equal(await store.accept("channel-A",2000000n,1000000n),true);
  assert.equal(await store.accept("channel-A",900719925474099312345n,1000000n),true);
 }finally{
  globalThis.fetch=oldFetch;
  if(oldUrl===undefined)delete process.env.KV_REST_API_URL;else process.env.KV_REST_API_URL=oldUrl;
  if(oldToken===undefined)delete process.env.KV_REST_API_TOKEN;else process.env.KV_REST_API_TOKEN=oldToken;
  if(oldVercel===undefined)delete process.env.VERCEL;else process.env.VERCEL=oldVercel;
 }
});
test("x402 replay store fails closed on Vercel when durable KV is missing",async()=>{
 const oldUrl=process.env.KV_REST_API_URL,oldToken=process.env.KV_REST_API_TOKEN,oldVercel=process.env.VERCEL;
 delete process.env.KV_REST_API_URL;delete process.env.KV_REST_API_TOKEN;process.env.VERCEL="1";
 try{await assert.rejects(new X402ReplayStore().accept("channel-A",1n,1n),/durable_x402_replay_store_not_configured/);}
 finally{
  if(oldUrl===undefined)delete process.env.KV_REST_API_URL;else process.env.KV_REST_API_URL=oldUrl;
  if(oldToken===undefined)delete process.env.KV_REST_API_TOKEN;else process.env.KV_REST_API_TOKEN=oldToken;
  if(oldVercel===undefined)delete process.env.VERCEL;else process.env.VERCEL=oldVercel;
 }
});
test("x402 replay store keeps local-only demo fallback outside Vercel",async()=>{
 const oldUrl=process.env.KV_REST_API_URL,oldToken=process.env.KV_REST_API_TOKEN,oldVercel=process.env.VERCEL;
 delete process.env.KV_REST_API_URL;delete process.env.KV_REST_API_TOKEN;delete process.env.VERCEL;
 try{
  const store=new X402ReplayStore();
  assert.equal(await store.accept("channel-local",2000000n,1000000n),true);
  assert.equal(await store.accept("channel-local",2000001n,1000000n),false);
  assert.equal(await store.accept("channel-local",3000000n,1000000n),true);
 }finally{
  if(oldUrl===undefined)delete process.env.KV_REST_API_URL;else process.env.KV_REST_API_URL=oldUrl;
  if(oldToken===undefined)delete process.env.KV_REST_API_TOKEN;else process.env.KV_REST_API_TOKEN=oldToken;
  if(oldVercel===undefined)delete process.env.VERCEL;else process.env.VERCEL=oldVercel;
 }
});
