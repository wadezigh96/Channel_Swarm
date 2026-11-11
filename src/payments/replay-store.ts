/**
 * Atomic cumulative-voucher replay protection backed by Redis/Upstash.
 * Local memory is only a developer-demo fallback; Vercel fails closed without KV.
 */
const ACCEPT_SCRIPT=`
local current=redis.call('GET',KEYS[1])
local candidate=ARGV[1]
if current then
  if string.len(current)>string.len(candidate) or
     (string.len(current)==string.len(candidate) and current>=candidate) then
    return 0
  end
end
redis.call('SET',KEYS[1],candidate)
return 1
`;
export class X402ReplayStore {
 private url=process.env.KV_REST_API_URL||"";
 private token=process.env.KV_REST_API_TOKEN||"";
 private localHighest=new Map<string,bigint>();
 isDurableConfigured(){return Boolean(this.url&&this.token);}
 async accept(channelId:string,cumulativeUnits:bigint):Promise<boolean>{
  if(cumulativeUnits<0n)throw new Error("invalid_cumulative_amount");
  const key="channelswarm:x402:highwater:"+channelId;
  if(this.isDurableConfigured()){
   const response=await fetch(this.url,{method:"POST",headers:{Authorization:"Bearer "+this.token,"Content-Type":"application/json"},body:JSON.stringify(["EVAL",ACCEPT_SCRIPT,"1",key,cumulativeUnits.toString()])});
   if(!response.ok)throw new Error("x402_replay_store_unavailable: "+response.status);
   const payload=await response.json() as {result?:number;error?:string};
   if(payload.error||payload.result===undefined)throw new Error("x402_replay_store_error");
   return Number(payload.result)===1;
  }
  if(process.env.VERCEL==="1")throw new Error("durable_x402_replay_store_not_configured");
  const previous=this.localHighest.get(key);
  if(previous!==undefined&&cumulativeUnits<=previous)return false;
  this.localHighest.set(key,cumulativeUnits);
  return true;
 }
}
