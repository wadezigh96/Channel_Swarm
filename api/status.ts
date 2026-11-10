export default async function handler(_req:any,res:any){
 res.setHeader("Cache-Control","no-store, max-age=0");
 const network=(process.env.NETWORK||"devnet").toLowerCase();
 const rpc=process.env.SOLANA_RPC_URL||(network==="mainnet"||network==="mainnet-beta"?"https://api.mainnet-beta.solana.com":"https://api.devnet.solana.com");
 let rpcHealthy=false;
 try{const r=await fetch(rpc,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"getHealth"}),signal:AbortSignal.timeout(3500)});const j=await r.json() as {result?:string};rpcHealthy=r.ok&&j.result==="ok";}catch{}
 const paypalMode=(process.env.PAYPAL_MODE||"sandbox").toLowerCase();
 const mainnet=network==="mainnet"||network==="mainnet-beta";
 return res.status(200).json({
  checkedAt:new Date().toISOString(),network,rpcHealthy,
  transactionMode:process.env.ONCHAIN==="true"?"onchain-configured":"simulation",
  mainnetTransactionGate:mainnet&&process.env.ONCHAIN==="true"&&process.env.ALLOW_MAINNET_TRANSACTIONS==="true"&&process.env.MAINNET_TX_APPROVED==="true",
  paypalMode,paypalCredentialsConfigured:Boolean(process.env.PAYPAL_CLIENT_ID&&process.env.PAYPAL_CLIENT_SECRET),
  paypalWebhookConfigured:Boolean(process.env.PAYPAL_WEBHOOK_ID),
  paypalLiveCaptureGate:paypalMode==="live"&&process.env.PAYPAL_LIVE_ENABLED==="true"&&process.env.PAYPAL_LIVE_CAPTURE_ENABLED==="true",
  durableLedgerConfigured:Boolean(process.env.KV_REST_API_URL&&process.env.KV_REST_API_TOKEN),
  aiAdvisorConfigured:Boolean(process.env.AI_GATEWAY_API_KEY),
  note:"Health/configuration only. This endpoint does not submit transactions or capture payments."
 });
}
