import assert from "node:assert/strict";
import {test} from "node:test";
import {advisePaymentRail} from "./rail-advisor.js";
test("AI Gateway advice is validated and explicitly non-executing",async()=>{
 const oldKey=process.env.AI_GATEWAY_API_KEY,oldModel=process.env.AI_GATEWAY_MODEL,oldFetch=globalThis.fetch;
 process.env.AI_GATEWAY_API_KEY="test-key";process.env.AI_GATEWAY_MODEL="test/provider";
 globalThis.fetch=(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({rail:"paypal",reason:"External fiat settlement is requested."})}}]}),{status:200})) as typeof fetch;
 try{const result=await advisePaymentRail({task:"Pay a data provider",amountUsd:2,solanaAvailable:true,paypalAvailable:true});assert.equal(result.rail,"paypal");assert.equal(result.requiresHumanApproval,true);}
 finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=oldKey;if(oldModel===undefined)delete process.env.AI_GATEWAY_MODEL;else process.env.AI_GATEWAY_MODEL=oldModel;}
});
test("AI advisor rejects model suggestion for unavailable rail",async()=>{
 const oldKey=process.env.AI_GATEWAY_API_KEY,oldFetch=globalThis.fetch;process.env.AI_GATEWAY_API_KEY="test-key";
 globalThis.fetch=(async()=>new Response(JSON.stringify({choices:[{message:{content:'{"rail":"paypal","reason":"test"}'}}]}),{status:200})) as typeof fetch;
 try{await assert.rejects(()=>advisePaymentRail({task:"Pay provider",amountUsd:2,solanaAvailable:true,paypalAvailable:false}),/selected_unavailable_rail/);}
 finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=oldKey;}
});
