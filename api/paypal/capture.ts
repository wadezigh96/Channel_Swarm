import { createHash, randomUUID } from "node:crypto";
import { PayPalClient } from "../../src/paypal/paypal-client.js";
import { PayPalLedger } from "../../src/paypal/payment-ledger.js";
export default async function handler(req:any,res:any){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"method_not_allowed"});}
 const secret=process.env.CHANNELSWARM_API_TOKEN;if(!secret||req.headers.authorization!=="Bearer "+secret)return res.status(401).json({error:"unauthorized"});
 try{
  const body=req.body??{},orderId=String(body.orderId??""),requestId=String(body.requestId??"");
  if(!orderId)return res.status(400).json({error:"paypal_order_id_required"});
  const ledger=new PayPalLedger();if(!ledger.isConfigured())return res.status(503).json({error:"durable_payment_ledger_not_configured"});
  const record=await ledger.get(orderId);if(!record)return res.status(404).json({error:"paypal_order_not_in_ledger"});
  if(record.status==="COMPLETED")return res.status(409).json({error:"paypal_order_already_completed"});
  if(!record.requestId)return res.status(409).json({error:"paypal_order_capture_reference_missing"});
  if(requestId&&requestId!==record.requestId)return res.status(409).json({error:"paypal_capture_request_reference_mismatch"});
  const lockToken=randomUUID();
  if(!await ledger.claimCapture(orderId,lockToken))return res.status(409).json({error:"paypal_capture_already_in_progress"});
  try{
   const paypal=new PayPalClient();const order=await paypal.getOrder(orderId);
   if(order.status!=="APPROVED")return res.status(409).json({error:"paypal_order_not_approved",status:order.status});
   const unit=order.purchase_units?.[0];
   if(!unit||unit.amount?.currency_code!=="USD"||unit.amount.value!==record.amountUsd||unit.custom_id!==record.requestId)return res.status(409).json({error:"paypal_order_does_not_match_persisted_payment_intent"});
   await ledger.save({...record,status:"APPROVED",updatedAt:new Date().toISOString()});
   const stableCaptureRequestId=createHash("sha256").update("channelswarm:capture:"+record.requestId).digest("hex").slice(0,36);
   const result=await paypal.captureOrder(orderId,stableCaptureRequestId);
   const captureResult=result.purchase_units?.flatMap(u=>u.payments?.captures??[]).find(c=>c.status==="COMPLETED");
   await ledger.save({...record,status:captureResult?"COMPLETED":"PENDING",updatedAt:new Date().toISOString()});
   return res.status(200).json({id:orderId,status:result.status,captureId:captureResult?.id??null,mode:paypal.mode});
  }finally{
   await ledger.releaseCapture(orderId,lockToken);
  }
 }catch(e){return res.status(400).json({error:e instanceof Error?e.message:"paypal_capture_failed"});}
}
