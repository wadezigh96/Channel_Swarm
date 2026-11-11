/**
 * Atomic cumulative-voucher replay protection backed by Redis/Upstash.
 * Local memory is a developer-demo fallback only; Vercel fails closed without KV.
 */
const ACCEPT_SCRIPT=`
local function norm(s)
 s=string.gsub(s,'^0+','')
 if s=='' then return '0' end
 return s
end
local function cmp(a,b)
 a=norm(a);b=norm(b)
 if string.len(a)<string.len(b) then return -1 end
 if string.len(a)>string.len(b) then return 1 end
 if a<b then return -1 elseif a>b then return 1 else return 0 end
end
local function add(a,b)
 a=norm(a);b=norm(b)
 local i=string.len(a);local j=string.len(b);local carry=0;local out=''
 while i>0 or j>0 or carry>0 do
  local x=0;local y=0
  if i>0 then x=tonumber(string.sub(a,i,i));i=i-1 end
  if j>0 then y=tonumber(string.sub(b,j,j));j=j-1 end
  local n=x+y+carry;carry=math.floor(n/10);out=tostring(n%10)..out
 end
 return norm(out)
end
local candidate=norm(ARGV[1]);local minimum=norm(ARGV[2])
local current=redis.call('GET',KEYS[1])
if current then
 current=norm(current)
 if cmp(candidate,current)<=0 then return 0 end
 if cmp(candidate,add(current,minimum))<0 then return -1 end
else
 if cmp(candidate,minimum)<0 then return -1 end
end
redis.call('SET',KEYS[1],candidate)
return 1
`;
export class X402ReplayStore {
 private url=process.env.KV_REST_API_URL||"";
 private token=process.env.KV_REST_API_TOKEN||"";
 private localHighest=new Map<string,bigint>();
 isDurableConfigured(){return Boolean(this.url&&this.token);}
 async accept(channelId:string,cumulativeUnits:bigint,minimumIncrement:bigint):Promise<boolean>{
  if(cumulativeUnits<0n||minimumIncrement<1n)throw new Error("invalid_cumulative_amount");
  const key="channelswarm:x402:highwater:"+channelId;
  if(this.isDurableConfigured()){
   const response=await fetch(this.url,{method:"POST",headers:{Authorization:"Bearer "+this.token,"Content-Type":"application/json"},body:JSON.stringify(["EVAL",ACCEPT_SCRIPT,"1",key,cumulativeUnits.toString(),minimumIncrement.toString()])});
   if(!response.ok)throw new Error("x402_replay_store_unavailable: "+response.status);
   const payload=await response.json() as {result?:number;error?:string};
   if(payload.error||payload.result===undefined)throw new Error("x402_replay_store_error");
   return Number(payload.result)===1;
  }
  if(process.env.VERCEL==="1")throw new Error("durable_x402_replay_store_not_configured");
  const previous=this.localHighest.get(key);
  if(previous!==undefined&&cumulativeUnits-previous<minimumIncrement)return false;
  if(previous===undefined&&cumulativeUnits<minimumIncrement)return false;
  this.localHighest.set(key,cumulativeUnits);return true;
 }
}
