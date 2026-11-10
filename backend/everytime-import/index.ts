import './everytime-model.js';
const model=(globalThis as any).EverytimeModel;
const origins=new Set(['https://noarmy04.github.io','http://127.0.0.1:4177','http://localhost:4177']);
const limits=new Map<string,{until:number,count:number}>();
Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('origin');
  const headers:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  if(origin&&origins.has(origin))headers['Access-Control-Allow-Origin']=origin;
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(origin&&!origins.has(origin))return json({error:'허용되지 않은 사이트입니다.'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return json({error:'POST 요청만 지원합니다.'},405);
  if(!req.headers.get('authorization')?.startsWith('Bearer '))return json({error:'익명 연결이 필요합니다.'},401);
  try{
    const raw=await req.text();if(raw.length>2048)return json({error:'링크가 너무 깁니다.'},400);
    const input=JSON.parse(raw),{identifier}=model.link(input.url);
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(req.headers.get('authorization')!));
    const key=Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join('');
    const now=Date.now();for(const [k,v] of limits)if(v.until<now)limits.delete(k);
    const limit=limits.get(key)||{until:now+60000,count:0};if(++limit.count>10)return json({error:'요청이 많아요. 1분 후 다시 시도해주세요.'},429);if(limits.size<2000||limits.has(key))limits.set(key,limit);
    const response=await fetch('https://api.everytime.kr/find/timetable/table/friend',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:'https://everytime.kr',Referer:'https://everytime.kr/'},body:new URLSearchParams({identifier,friendInfo:'false'}),redirect:'error',signal:AbortSignal.timeout(12000)});
    if(!response.ok)return json({error:'에타에서 시간표를 불러오지 못했어요. 잠시 후 다시 시도해주세요.'},502);
    const reader=response.body!.getReader(),chunks:Uint8Array[]=[];let length=0;
    while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>200000){await reader.cancel();return json({error:'시간표 데이터가 너무 큽니다.'},502);}chunks.push(value);}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return json(model.parseXml(new TextDecoder().decode(bytes)));
  }catch(error){const message=error instanceof Error?error.message:'';if(/timeout|abort|fetch|network/i.test(message))return json({error:'에타 연결이 지연되고 있어요. 잠시 후 다시 시도해주세요.'},502);return json({error:message||'시간표 정보를 읽을 수 없어요.'},400);}
});
