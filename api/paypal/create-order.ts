import { randomUUID } from "node:crypto";
import { PayPalClient } from "../../src/paypal/paypal-client.js";
import { PayPalLedger } from "../../src/paypal/payment-ledger.js";
export default async function handler(req:any,res:any){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"method_not_allowed"});}
 const secret=process.env.CHANNELSWARM_API_TOKEN;if(!secret||req.headers.authorization!=="Bearer "+secret)return res.status(401).json({error:"unauthorized"});
 try{
  const body=req.body??{},amountUsd=Number(body.amountUsd),description=String(body.description??"ChannelSwarm agent checkout").slice(0,120),requestId=String(body.requestId??randomUUID());
  if(!Number.isFinite(amountUsd)||amountUsd<1||amountUsd>10000)return res.status(400).json({error:"amount_must_be_between_1_and_10000_USD"});
  if(requestId.length<8||requestId.length>38)return res.status(400).json({error:"invalid_request_id"});
  const ledger=new PayPalLedger();if(!ledger.isConfigured())return res.status(503).json({error:"durable_payment_ledger_not_configured"});
  const paypal=new PayPalClient();if(!paypal.isConfigured())return res.status(503).json({error:"paypal_credentials_missing"});
  const order=await paypal.createOrder(amountUsd,description,requestId);
  await ledger.save({orderId:order.id,requestId,amountUsd:amountUsd.toFixed(2),currency:"USD",status:"CREATED",updatedAt:new Date().toISOString()});
  return res.status(201).json({id:order.id,status:order.status,approveUrl:order.approveUrl,mode:paypal.mode,capturePerformed:false});
 }catch(e){return res.status(400).json({error:e instanceof Error?e.message:"paypal_order_creation_failed"});}
}
