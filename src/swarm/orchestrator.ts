/**
 * Swarm orchestrator. AI advice never executes a payment; payment rails are explicitly selected.
 */
import { Connection,Keypair,PublicKey } from "@solana/web3.js";
import { randomUUID } from "node:crypto";
import { ChannelManager } from "../payments/channel-manager.js";
import { StocknizedAgent } from "../stock/stocknized-agent.js";
import { ReputationRegistry } from "../reputation/reputation.js";
import { PayPalClient } from "../paypal/paypal-client.js";
import { PayPalLedger } from "../paypal/payment-ledger.js";
import { advisePaymentRail,type RailAdvice } from "../ai/rail-advisor.js";
export interface AgentIdentity {name:string;keypair:Keypair;role:"data"|"compute"|"stock"|"general";reputation:number}
export class SwarmOrchestrator {
 private connection:Connection;private agents:AgentIdentity[]=[];private channelManagers=new Map<string,ChannelManager>();
 private stockAgent:StocknizedAgent|null=null;private usdcMint:PublicKey;private onchain:boolean;
 private paypal:PayPalClient;private paymentLedger=new PayPalLedger();private reputation=new ReputationRegistry();
 constructor(connection:Connection,usdcMint:PublicKey,onchain=false){this.connection=connection;this.usdcMint=usdcMint;this.onchain=onchain;this.paypal=new PayPalClient();}
 getReputation(){return this.reputation;}
 addAgent(name:string,role:AgentIdentity["role"],keypair?:Keypair){
  const kp=keypair??Keypair.generate(),agent:AgentIdentity={name,keypair:kp,role,reputation:1};
  this.agents.push(agent);this.reputation.register(name);
  const cm=new ChannelManager({connection:this.connection,payer:kp,usdcMint:this.usdcMint,onchain:this.onchain&&role==="general"});
  this.channelManagers.set(name,cm);
  if(role==="stock")this.stockAgent=new StocknizedAgent(this.connection,kp);
  console.log(`[Swarm] Agent ${name} (${role}) online — ${kp.publicKey.toBase58().slice(0,8)}...`);
  return agent;
 }
 async runDemoCycle(voucherCount=20,perVoucherUsdc=0.002){
  if(this.agents.length<2)throw new Error("Need at least 2 agents");
  const alpha=this.agents.find(a=>a.role==="general")??this.agents[0]!;
  const dataAgent=this.agents.find(a=>a.role==="data")??this.agents[1]!;
  const cm=this.channelManagers.get(alpha.name)!;
  if(!this.reputation.canOpenChannel(dataAgent.name,0.5))throw new Error(`Reputation too low to open channel with ${dataAgent.name} (min 0.5)`);
  const channelId=await cm.openChannel({counterparty:dataAgent.keypair.publicKey,ceilingUsdc:5});
  for(let i=0;i<voucherCount;i++)await cm.createVoucher(channelId,perVoucherUsdc);
  if(this.stockAgent)await this.stockAgent.runStrategy();
  const settlement=cm.isOnchain()?await cm.settleAndSeal(channelId,dataAgent.keypair):await cm.settle(channelId);
  const {claimed,refunded,signature}=settlement;
  dataAgent.reputation=this.reputation.recordSuccess(dataAgent.name,claimed);
  alpha.reputation=this.reputation.recordSuccess(alpha.name,claimed*0.4);
  if(signature)console.log("[Swarm] Settlement signature: "+signature);
  if(settlement.sealSignature)console.log("[Swarm] Seal signature: "+settlement.sealSignature);
  if(settlement.distributeSignature)console.log("[Swarm] Distribution signature: "+settlement.distributeSignature);
  if(!settlement.finalized)console.log("[Swarm] Channel is not finalized; distribution remains outstanding.");
  return{claimed,refunded,signature,sealSignature:settlement.sealSignature,distributeSignature:settlement.distributeSignature,channelId};
 }
 async createPayPalCheckout(amountUsd:number,description:string,requestId?:string){
  if(!this.paypal.isConfigured())throw new Error("paypal_credentials_missing");
  if(!this.paymentLedger.isConfigured())throw new Error("durable_payment_ledger_required_for_paypal_checkout");
  const stableRequestId=requestId??randomUUID();
  const order=await this.paypal.createOrder(amountUsd,description,stableRequestId);
  await this.paymentLedger.save({orderId:order.id,requestId:stableRequestId,amountUsd:amountUsd.toFixed(2),currency:"USD",status:"CREATED",updatedAt:new Date().toISOString()});
  return order;
 }
 /** Manual capture only after PayPal status is APPROVED and a matching ledger entry exists. */
 async capturePayPalCheckout(orderId:string,requestId?:string){
  if(!this.paymentLedger.isConfigured())throw new Error("durable_payment_ledger_required_for_paypal_checkout");
  const record=await this.paymentLedger.get(orderId);
  if(!record)throw new Error("paypal_order_not_in_durable_ledger");
  if(record.status==="COMPLETED")throw new Error("paypal_order_already_completed");
  const order=await this.paypal.getOrder(orderId);
  if(order.status!=="APPROVED")throw new Error("paypal_order_not_approved: "+order.status);
  const unit=order.purchase_units?.[0];
  if(!unit||unit.amount?.currency_code!=="USD"||unit.amount.value!==record.amountUsd||unit.custom_id!==record.requestId)throw new Error("paypal_order_does_not_match_persisted_payment_intent");
  await this.paymentLedger.save({...record,status:"APPROVED",updatedAt:new Date().toISOString()});
  const captured=await this.paypal.captureOrder(orderId,requestId);
  const capture=captured.purchase_units?.flatMap(u=>u.payments?.captures??[]).find(c=>c.status==="COMPLETED");
  await this.paymentLedger.save({...record,status:capture?"COMPLETED":"PENDING",updatedAt:new Date().toISOString()});
  return captured;
 }
 /** Model suggestion only; the caller must choose and approve the payment rail. */
 async recommendPaymentRail(input:{task:string;amountUsd:number;solanaAvailable:boolean;paypalAvailable:boolean}):Promise<RailAdvice>{return advisePaymentRail(input);}
 listAgents(){return this.agents.map(a=>({name:a.name,role:a.role,pubkey:a.keypair.publicKey.toBase58(),reputation:this.reputation.get(a.name)?.score??a.reputation}));}
}
