import { PayPalClient } from "../../src/paypal/paypal-client.js";
import { PayPalLedger } from "../../src/paypal/payment-ledger.js";
export default async function handler(req:any,res:any){
 if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({error:"method_not_allowed"});}
 try{
  const orderId=String(req.query?.token??"");if(!orderId)return res.status(400).json({error:"paypal_order_id_required"});
  const ledger=new PayPalLedger();if(!ledger.isConfigured())return res.status(503).json({error:"durable_payment_ledger_not_configured"});
  const record=await ledger.get(orderId);if(!record)return res.status(404).json({error:"paypal_order_not_in_ledger"});
  const paypal=new PayPalClient(),order=await paypal.getOrder(orderId);
  if(order.status==="APPROVED")await ledger.save({...record,status:"APPROVED",updatedAt:new Date().toISOString()});
  return res.status(200).json({orderId,status:order.status,capturePerformed:false,message:"Approval checked. No payment capture was performed."});
 }catch(e){return res.status(400).json({error:e instanceof Error?e.message:"paypal_return_verification_failed"});}
}
