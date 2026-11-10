import assert from "node:assert/strict";
import { test } from "node:test";
import { PayPalLedger } from "./payment-ledger.js";

test("PayPal ledger persists verified webhook events and deduplicates retries", async () => {
  const oldUrl=process.env.KV_REST_API_URL,oldToken=process.env.KV_REST_API_TOKEN,oldFetch=globalThis.fetch;
  process.env.KV_REST_API_URL="https://kv.example.test";
  process.env.KV_REST_API_TOKEN="test-token";
  const store=new Map<string,string>();
  globalThis.fetch=(async (_input,init) => {
    const args=JSON.parse(String(init?.body)) as Array<string|number>;
    const [command,...rest]=args;
    let result:unknown=null;
    if(command==="GET") result=store.get(String(rest[0]))??null;
    else if(command==="SET") {
      const key=String(rest[0]),value=String(rest[1]),nx=rest.includes("NX");
      if(nx&&store.has(key)) result=null;
      else {store.set(key,value);result="OK";}
    } else if(command==="DEL") {result=store.delete(String(rest[0]))?1:0;}
    else if(command==="EVAL") {
      const key=String(rest[2]),newRank=Number(rest[3]),value=String(rest[4]);
      const ranks:Record<string,number>={UNKNOWN:0,CREATED:1,APPROVED:2,PENDING:3,DENIED:4,COMPLETED:5,REVERSED:6};
      const previous=store.get(key);
      if(previous&&ranks[JSON.parse(previous).status]>newRank)result=0;
      else {store.set(key,value);result=1;}
    }
    return new Response(JSON.stringify({result}),{status:200,headers:{"content-type":"application/json"}});
  }) as typeof fetch;
  try {
    const ledger=new PayPalLedger();
    const first=await ledger.recordWebhook("EVENT-1","PAYMENT.CAPTURE.COMPLETED","ORDER-1","COMPLETED");
    assert.equal(first.duplicate,false);
    assert.equal(first.record.status,"COMPLETED");
    const retry=await ledger.recordWebhook("EVENT-1","PAYMENT.CAPTURE.COMPLETED","ORDER-1","COMPLETED");
    assert.equal(retry.duplicate,true);
    assert.equal(retry.record.status,"COMPLETED");
    await ledger.save({...first.record,status:"PENDING"});
    const stillCompleted=await ledger.get("ORDER-1");
    assert.equal(stillCompleted?.status,"COMPLETED");
  } finally {
    globalThis.fetch=oldFetch;
    if(oldUrl===undefined)delete process.env.KV_REST_API_URL;else process.env.KV_REST_API_URL=oldUrl;
    if(oldToken===undefined)delete process.env.KV_REST_API_TOKEN;else process.env.KV_REST_API_TOKEN=oldToken;
  }
});

test("PayPal ledger refuses to run without persistent KV credentials", async () => {
  const oldUrl=process.env.KV_REST_API_URL,oldToken=process.env.KV_REST_API_TOKEN;
  delete process.env.KV_REST_API_URL;delete process.env.KV_REST_API_TOKEN;
  try { await assert.rejects(new PayPalLedger().get("ORDER-1"),/durable_payment_ledger_not_configured/); }
  finally {
    if(oldUrl===undefined)delete process.env.KV_REST_API_URL;else process.env.KV_REST_API_URL=oldUrl;
    if(oldToken===undefined)delete process.env.KV_REST_API_TOKEN;else process.env.KV_REST_API_TOKEN=oldToken;
  }
});
