import assert from "node:assert/strict";
import {test} from "node:test";
import {PayPalLedger} from "./payment-ledger.js";

test("PayPal ledger atomically records and deduplicates webhook events",async()=>{
 const oldUrl=process.env.KV_REST_API_URL,oldToken=process.env.KV_REST_API_TOKEN,oldFetch=globalThis.fetch;
 process.env.KV_REST_API_URL="https://kv.example.test";process.env.KV_REST_API_TOKEN="test-token";
 const store=new Map<string,string>();
 globalThis.fetch=(async(_input,init)=>{
  const args=JSON.parse(String(init?.body)) as string[];
  let result:unknown=null;
  if(args[0]==="GET")result=store.get(args[1])??null;
  else if(args[0]==="EVAL"){
   const script=args[1],numKeys=Number(args[2]),keys=args.slice(3,3+numKeys),argv=args.slice(3+numKeys);
   if(script.includes("EXISTS")&&script.includes("KEYS[1]")){
    const [orderId,eventType,status,updatedAt,eventId]=argv,eventKey=keys[0],orderKey=keys[1];
    const duplicate=store.has(eventKey),priorRaw=store.get(orderKey);
    let record=priorRaw?JSON.parse(priorRaw):{orderId,status:"UNKNOWN",updatedAt};
    if(!duplicate){
     const rank:Record<string,number>={UNKNOWN:0,CREATED:1,APPROVED:2,PENDING:3,DENIED:4,COMPLETED:5,REVERSED:6};
     if((rank[record.status]??0)<=(rank[status]??0))record.status=status;
     record.lastEventId=eventId;record.lastEventType=eventType;record.updatedAt=updatedAt;
     store.set(orderKey,JSON.stringify(record));store.set(eventKey,"processed");
    }
    result=[duplicate?1:0,store.get(orderKey)??JSON.stringify(record)];
   }else{
    const [key]=keys,[status,value]=argv,prior=store.get(key);
    const rank:Record<string,number>={UNKNOWN:0,CREATED:1,APPROVED:2,PENDING:3,DENIED:4,COMPLETED:5,REVERSED:6};
    if(prior&&(rank[JSON.parse(prior).status]??0)>Number(status))result=0;
    else{store.set(key,value);result=1;}
   }
  }
  return new Response(JSON.stringify({result}),{status:200,headers:{"content-type":"application/json"}});
 }) as typeof fetch;
 try{
  const ledger=new PayPalLedger();
  const first=await ledger.recordWebhook("EVENT-1","PAYMENT.CAPTURE.COMPLETED","ORDER-1","COMPLETED");
  assert.equal(first.duplicate,false);assert.equal(first.record.status,"COMPLETED");
  const retry=await ledger.recordWebhook("EVENT-1","PAYMENT.CAPTURE.COMPLETED","ORDER-1","COMPLETED");
  assert.equal(retry.duplicate,true);assert.equal(retry.record.status,"COMPLETED");
  await ledger.save({...first.record,status:"PENDING"});
  assert.equal((await ledger.get("ORDER-1"))?.status,"COMPLETED");
 }finally{
  globalThis.fetch=oldFetch;
  if(oldUrl===undefined)delete process.env.KV_REST_API_URL;else process.env.KV_REST_API_URL=oldUrl;
  if(oldToken===undefined)delete process.env.KV_REST_API_TOKEN;else process.env.KV_REST_API_TOKEN=oldToken;
 }
});

test("PayPal ledger refuses to run without persistent KV credentials",async()=>{
 const oldUrl=process.env.KV_REST_API_URL,oldToken=process.env.KV_REST_API_TOKEN;
 delete process.env.KV_REST_API_URL;delete process.env.KV_REST_API_TOKEN;
 try{await assert.rejects(new PayPalLedger().get("ORDER-1"),/durable_payment_ledger_not_configured/);}
 finally{
  if(oldUrl===undefined)delete process.env.KV_REST_API_URL;else process.env.KV_REST_API_URL=oldUrl;
  if(oldToken===undefined)delete process.env.KV_REST_API_TOKEN;else process.env.KV_REST_API_TOKEN=oldToken;
 }
});
