/**
 * Durable PayPal order and webhook ledger using atomic Redis/Upstash operations.
 * No ephemeral fallback is permitted for payment records.
 */
export type LedgerStatus="CREATED"|"APPROVED"|"PENDING"|"COMPLETED"|"DENIED"|"REVERSED"|"UNKNOWN";
export interface PayPalLedgerRecord {orderId:string;requestId?:string;amountUsd?:string;currency?:string;status:LedgerStatus;lastEventId?:string;lastEventType?:string;updatedAt:string}
const RANK:Record<LedgerStatus,number>={UNKNOWN:0,CREATED:1,APPROVED:2,PENDING:3,DENIED:4,COMPLETED:5,REVERSED:6};
const SAVE_SCRIPT=`
local ranks={UNKNOWN=0,CREATED=1,APPROVED=2,PENDING=3,DENIED=4,COMPLETED=5,REVERSED=6}
local current=redis.call('GET',KEYS[1])
if current then
  local ok,old=pcall(cjson.decode,current)
  if ok and old.status and (ranks[old.status] or 0)>(ranks[ARGV[1]] or 0) then return 0 end
end
redis.call('SET',KEYS[1],ARGV[2])
return 1
`;
const WEBHOOK_SCRIPT=`
local ranks={UNKNOWN=0,CREATED=1,APPROVED=2,PENDING=3,DENIED=4,COMPLETED=5,REVERSED=6}
local duplicate=redis.call('EXISTS',KEYS[1])
local current=redis.call('GET',KEYS[2])
if duplicate==1 then
  if current then return {1,current} end
  return {1,cjson.encode({orderId=ARGV[1],status='UNKNOWN',updatedAt=ARGV[4]})}
end
local record
if current then record=cjson.decode(current)
else record={orderId=ARGV[1],status='UNKNOWN',updatedAt=ARGV[4]} end
if (ranks[record.status] or 0)<=(ranks[ARGV[3]] or 0) then record.status=ARGV[3] end
record.lastEventId=ARGV[5]
record.lastEventType=ARGV[2]
record.updatedAt=ARGV[4]
local encoded=cjson.encode(record)
redis.call('SET',KEYS[2],encoded)
redis.call('SET',KEYS[1],'processed')
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
  const out=await r.json() as {result:T;error?:string};
  if(out.error)throw new Error("payment_ledger_error");
  return out.result;
 }
 async save(record:PayPalLedgerRecord):Promise<void>{
  await this.command<number>("EVAL",SAVE_SCRIPT,"1","channelswarm:paypal:order:"+record.orderId,record.status,JSON.stringify(record));
 }
 async get(orderId:string):Promise<PayPalLedgerRecord|null>{
  const raw=await this.command<string|null>("GET","channelswarm:paypal:order:"+orderId);
  return raw?JSON.parse(raw) as PayPalLedgerRecord:null;
 }
 async recordWebhook(eventId:string,eventType:string,orderId:string,status:LedgerStatus):Promise<{duplicate:boolean;record:PayPalLedgerRecord}>{
  if(!eventId||!orderId)throw new Error("paypal_webhook_event_or_order_id_missing");
  const updatedAt=new Date().toISOString();
  const result=await this.command<[number,string]>("EVAL",WEBHOOK_SCRIPT,"2","channelswarm:paypal:event:"+eventId,"channelswarm:paypal:order:"+orderId,orderId,eventType,status,updatedAt,eventId);
  const record=JSON.parse(result[1]) as PayPalLedgerRecord;
  return{duplicate:Number(result[0])===1,record};
 }
}
