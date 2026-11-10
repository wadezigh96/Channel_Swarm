/**
 * Durable PayPal order and webhook ledger using Vercel KV / Upstash REST.
 * This is required for both checkout and capture flows; no ephemeral fallback.
 */
export type LedgerStatus="CREATED"|"APPROVED"|"PENDING"|"COMPLETED"|"DENIED"|"REVERSED"|"UNKNOWN";
export interface PayPalLedgerRecord {orderId:string;requestId?:string;amountUsd?:string;currency?:string;status:LedgerStatus;lastEventId?:string;lastEventType?:string;updatedAt:string}
const rank:Record<LedgerStatus,number>={UNKNOWN:0,CREATED:1,APPROVED:2,PENDING:3,DENIED:4,COMPLETED:5,REVERSED:6};
export class PayPalLedger {
 private url=process.env.KV_REST_API_URL||"";private token=process.env.KV_REST_API_TOKEN||"";
 isConfigured(){return Boolean(this.url&&this.token);}
 private async command<T>(...args:(string|number)[]):Promise<T>{if(!this.isConfigured())throw new Error("durable_payment_ledger_not_configured");const r=await fetch(this.url,{method:"POST",headers:{Authorization:"Bearer "+this.token,"Content-Type":"application/json"},body:JSON.stringify(args)});if(!r.ok)throw new Error("payment_ledger_unavailable: "+r.status);const out=await r.json() as {result:T;error?:string};if(out.error)throw new Error("payment_ledger_error");return out.result;}
 async save(record:PayPalLedgerRecord):Promise<void>{const prior=await this.get(record.orderId);if(prior&&rank[prior.status]>rank[record.status])return;await this.command("SET","channelswarm:paypal:order:"+record.orderId,JSON.stringify(record));}
 async get(orderId:string):Promise<PayPalLedgerRecord|null>{const raw=await this.command<string|null>("GET","channelswarm:paypal:order:"+orderId);return raw?JSON.parse(raw) as PayPalLedgerRecord:null;}
 async recordWebhook(eventId:string,eventType:string,orderId:string,status:LedgerStatus):Promise<{duplicate:boolean;record:PayPalLedgerRecord}>{
  if(!eventId||!orderId)throw new Error("paypal_webhook_event_or_order_id_missing");
  const eventKey="channelswarm:paypal:event:"+eventId;
  const first=await this.command<string|null>("SET",eventKey,"pending","NX");
  const existingEvent=first==="OK"?null:await this.command<string|null>("GET",eventKey);
  if(existingEvent==="processed"){const existing=await this.get(orderId);return{duplicate:true,record:existing??{orderId,status:"UNKNOWN",updatedAt:new Date().toISOString()}};}
  const prior=await this.get(orderId);
  const record:PayPalLedgerRecord={...(prior??{orderId,status:"UNKNOWN" as LedgerStatus,updatedAt:new Date().toISOString()}),orderId,status:prior&&rank[prior.status]>rank[status]?prior.status:status,lastEventId:eventId,lastEventType:eventType,updatedAt:new Date().toISOString()};
  await this.save(record);
  await this.command("SET",eventKey,"processed");
  return{duplicate:first!=="OK",record};
 }
}
