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
  const paypal=new PayPalClient();const order=await paypal.getOrder(orderId);
  if(order.status!=="APPROVED")return res.status(409).json({error:"paypal_order_not_approved",status:order.status});
  const result=await paypal.captureOrder(orderId,requestId||undefined);
  const captureResult=result.purchase_units?.flatMap(u=>u.payments?.captures??[]).find(c=>c.status==="COMPLETED");
  await ledger.save({...record,status:captureResult?"COMPLETED":"PENDING",updatedAt:new Date().toISOString()});
  return res.status(200).json({id:orderId,status:result.status,captureId:captureResult?.id??null,mode:paypal.mode});
 }catch(e){return res.status(400).json({error:e instanceof Error?e.message:"paypal_capture_failed"});}
}
