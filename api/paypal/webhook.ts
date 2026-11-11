import { PayPalClient } from "../../src/paypal/paypal-client.js";
import { PayPalLedger, type LedgerStatus } from "../../src/paypal/payment-ledger.js";
export default async function handler(req:any,res:any){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"method_not_allowed"});}
 try{
  const body=req.body??{},h=req.headers??{},client=new PayPalClient();
  const verified=await client.verifyWebhook({transmissionId:h["paypal-transmission-id"],transmissionTime:h["paypal-transmission-time"],certUrl:h["paypal-cert-url"],authAlgo:h["paypal-auth-algo"],transmissionSig:h["paypal-transmission-sig"]},body);
  if(!verified)return res.status(401).json({error:"invalid_webhook_signature"});
  const eventId=String(body.id??""),eventType=String(body.event_type??""),resource=body.resource??{};
  // Capture/refund events identify the capture as resource.id; use the related order ID first.
  const orderId=String(resource.supplementary_data?.related_ids?.order_id??resource.id??"");
  const status:LedgerStatus=eventType==="CHECKOUT.ORDER.APPROVED"?"APPROVED":eventType==="PAYMENT.CAPTURE.COMPLETED"?"COMPLETED":eventType==="PAYMENT.CAPTURE.PENDING"?"PENDING":eventType==="PAYMENT.CAPTURE.DENIED"?"DENIED":(eventType==="CHECKOUT.PAYMENT-APPROVAL.REVERSED"||eventType==="PAYMENT.CAPTURE.REVERSED"||eventType==="PAYMENT.CAPTURE.REFUNDED")?"REVERSED":"UNKNOWN";
  if(!eventId||!orderId)return res.status(202).json({received:true,recorded:false,reason:"event_not_order_scoped"});
  const ledger=new PayPalLedger(),result=await ledger.recordWebhook(eventId,eventType,orderId,status);
  return res.status(200).json({received:true,duplicate:result.duplicate,status:result.record.status});
 }catch(e){return res.status(500).json({error:e instanceof Error?e.message:"webhook_processing_failed"});}
}
