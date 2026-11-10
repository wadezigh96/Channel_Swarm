import { advisePaymentRail } from "../../src/ai/rail-advisor.js";
export default async function handler(req:any,res:any){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"method_not_allowed"});}
 const token=process.env.CHANNELSWARM_API_TOKEN;
 if(!token||req.headers.authorization!=="Bearer "+token)return res.status(401).json({error:"unauthorized"});
 try{const body=req.body??{};const advice=await advisePaymentRail({task:String(body.task??""),amountUsd:Number(body.amountUsd),solanaAvailable:Boolean(body.solanaAvailable),paypalAvailable:Boolean(body.paypalAvailable)});return res.status(200).json(advice);}
 catch(e){return res.status(400).json({error:e instanceof Error?e.message:"advice_failed"});}
}
