/**
 * AI Gateway payment-rail advisor. Suggestions are advisory only:
 * no key signing, payment creation, capture, or Solana transaction occurs here.
 */
export type PaymentRail="solana"|"paypal";
export interface RailAdvice {rail:PaymentRail;reason:string;requiresHumanApproval:true;model:string}
export async function advisePaymentRail(input:{task:string;amountUsd:number;solanaAvailable:boolean;paypalAvailable:boolean}):Promise<RailAdvice>{
 if(!process.env.AI_GATEWAY_API_KEY)throw new Error("AI_GATEWAY_API_KEY_not_configured");
 if(!input.task.trim()||input.task.length>2000)throw new Error("invalid_task_description");
 if(!Number.isFinite(input.amountUsd)||input.amountUsd<=0)throw new Error("invalid_payment_amount");
 if(!input.solanaAvailable&&!input.paypalAvailable)throw new Error("no_payment_rail_available");
 const model=process.env.AI_GATEWAY_MODEL||"nvidia/nemotron-3-nano-30b-a3b";
 const response=await fetch("https://ai-gateway.vercel.sh/v1/chat/completions",{method:"POST",headers:{Authorization:"Bearer "+process.env.AI_GATEWAY_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({model,temperature:0.1,max_tokens:300,response_format:{type:"json_object"},messages:[{role:"system",content:"You advise on payment rail selection for an agent economy. Choose only an available rail. Never claim a payment was made. Return JSON with rail ('solana' or 'paypal') and a short reason. This is advice only; a human must approve every payment."},{role:"user",content:JSON.stringify(input)}] }),signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error("ai_gateway_request_failed: "+response.status);
 const data=await response.json() as {choices?:Array<{message?:{content?:string}}>};
 const content=data.choices?.[0]?.message?.content;if(!content)throw new Error("ai_gateway_empty_response");
 let parsed:any;try{parsed=JSON.parse(content);}catch{throw new Error("ai_gateway_invalid_json");}
 if(parsed.rail!=="solana"&&parsed.rail!=="paypal")throw new Error("ai_gateway_invalid_payment_rail");
 if(parsed.rail==="solana"&&!input.solanaAvailable||parsed.rail==="paypal"&&!input.paypalAvailable)throw new Error("ai_gateway_selected_unavailable_rail");
 return{rail:parsed.rail,reason:String(parsed.reason??"").slice(0,400),requiresHumanApproval:true,model};
}
