/**
 * Durable PayPal order and webhook ledger using atomic Redis/Upstash operations.
 * No ephemeral fallback is permitted for payment records.
 */
export type LedgerStatus="CREATED"|"APPROVED"|"PENDING"|"COMPLETED"|"DENIED"|"REVERSED"|"UNKNOWN";
export interface PayPalLedgerRecord {orderId:string;requestId?:string;amountUsd?:string;currency?:string;status:LedgerStatus;lastEventId?:string;lastEventType?:string;updatedAt:string}
const STATUS_RANK:Record<LedgerStatus,number>={UNKNOWN:0,CREATED:1,APPROVED:2,PENDING:3,DENIED:4,COMPLETED:5,REVERSED:6};
const SAVE_SCRIPT=`
local ranks={UNKNOWN=0,CREATED=1,APPROVED=2,PENDING=3,DENIED=4,COMPLETED=5,REVERSED=6}
local current=redis.call('GET',KEYS[1])
if current then
 local ok,old=pcall(cjson.decode,current)
 if ok and old.status and (ranks[old.status] or 0)>tonumber(ARGV[1]) then return 0 end
end
redis.call('SET',KEYS[1],ARGV[2])
return 1
`;
const CLAIM_CAPTURE_SCRIPT=`
local result=redis.call('SET',KEYS[1],ARGV[1],'NX','EX',ARGV[2])
if result then return 1 end
return 0
`;
const RELEASE_CAPTURE_SCRIPT=`
if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end
return 0
`;
const WEBHOOK_SCRIPT=`
local ranks={UNKNOWN=0,CREATED=1,APPROVED=2,PENDING=3,DENIED=4,COMPLETED=5,REVERSED=6}
if redis.call('EXISTS',KEYS[1])==1 then
 local existing=redis.call('GET',KEYS[2])
 if existing then return {1,existing} end
 return {1,cjson.encode({orderId=ARGV[1],status='UNKNOWN',updatedAt=ARGV[4]})}
end
local current=redis.call('GET',KEYS[2])
local record
if current then record=cjson.decode(current) else record={orderId=ARGV[1],status='UNKNOWN',updatedAt=ARGV[4]} end
if (ranks[record.status] or 0)<=(ranks[ARGV[3]] or 0) then record.status=ARGV[3] end
record.lastEventId=ARGV[5];record.lastEventType=ARGV[2];record.updatedAt=ARGV[4]
local encoded=cjson.encode(record)
redis.call('SET',KEYS[2],encoded);redis.call('SET',KEYS[1],'processed')
return {0,encoded}
`;
export class PayPalLedger {
 private url=process.env.KV_REST_API_URL||"";
 private token=process.env.KV_REST_API_TOKEN||"";
 isConfigured(){return Boolean(this.url&&this.token);}
 private async command<T>(...args:(string|number)[]):Promise<T>{
  if(!this.isConfigured())throw new Error("durable_payment_ledger_not_configured");
  const r=await fetch(this.url,{method:"POST",headers:{Authorization:"Bearer "+this.token,"Content-Type":"application/json"},body:JSON.stringify(args)});
  if(!r.ok)throw new Error("payment_ledger_unavailable: "+r.status);
  const out=await r.json() as {result:T;error?:string};if(out.error)throw new Error("payment_ledger_error");return out.result;
 }
 async save(record:PayPalLedgerRecord):Promise<void>{
  const result=await this.command<number>("EVAL",SAVE_SCRIPT,"1","channelswarm:paypal:order:"+record.orderId,String(STATUS_RANK[record.status]),JSON.stringify(record));
  if(Number(result)!==1){
   const current=await this.get(record.orderId);
   if(current&&STATUS_RANK[current.status]>=STATUS_RANK[record.status])return;
   throw new Error("paypal_ledger_status_regression_rejected");
  }
 }
 async claimCapture(orderId:string,token:string,ttlSeconds=300):Promise<boolean>{
  if(!orderId||!token||!Number.isInteger(ttlSeconds)||ttlSeconds<30)throw new Error("invalid_paypal_capture_lock");
  const result=await this.command<number>("EVAL",CLAIM_CAPTURE_SCRIPT,"1","channelswarm:paypal:capture-lock:"+orderId,token,String(ttlSeconds));
  return Number(result)===1;
 }
 async releaseCapture(orderId:string,token:string):Promise<void>{
  await this.command<number>("EVAL",RELEASE_CAPTURE_SCRIPT,"1","channelswarm:paypal:capture-lock:"+orderId,token);
 }
 async get(orderId:string):Promise<PayPalLedgerRecord|null>{
  const raw=await this.command<string|null>("GET","channelswarm:paypal:order:"+orderId);return raw?JSON.parse(raw) as PayPalLedgerRecord:null;
 }
 async recordWebhook(eventId:string,eventType:string,orderId:string,status:LedgerStatus):Promise<{duplicate:boolean;record:PayPalLedgerRecord}>{
  if(!eventId||!orderId)throw new Error("paypal_webhook_event_or_order_id_missing");
  const updatedAt=new Date().toISOString();
  const result=await this.command<[number,string]>("EVAL",WEBHOOK_SCRIPT,"2","channelswarm:paypal:event:"+eventId,"channelswarm:paypal:order:"+orderId,orderId,eventType,status,updatedAt,eventId);
  return{duplicate:Number(result[0])===1,record:JSON.parse(result[1]) as PayPalLedgerRecord};
 }
}
