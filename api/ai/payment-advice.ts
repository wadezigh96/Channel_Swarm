import { advisePaymentRail } from "../../src/ai/rail-advisor.js";
export default async function handler(req:any,res:any){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"method_not_allowed"});}
 const token=process.env.CHANNELSWARM_API_TOKEN;
 if(!token||req.headers.authorization!=="Bearer "+token)return res.status(401).json({error:"unauthorized"});
 try{
  if(Buffer.byteLength(JSON.stringify(req.body??{}),"utf8")>4096)return res.status(413).json({error:"request_too_large"});
  const body=req.body??{},oidc=req.headers["x-vercel-oidc-token"];
  const oidcToken=typeof oidc==="string"?oidc:Array.isArray(oidc)?oidc[0]:undefined;
  const advice=await advisePaymentRail({task:String(body.task??""),amountUsd:Number(body.amountUsd),solanaAvailable:Boolean(body.solanaAvailable),paypalAvailable:Boolean(body.paypalAvailable)},{apiKey:process.env.AI_GATEWAY_API_KEY||oidcToken||process.env.VERCEL_OIDC_TOKEN});
  return res.status(200).json(advice);
 }
 catch(e){return res.status(400).json({error:e instanceof Error?e.message:"advice_failed"});}
}
