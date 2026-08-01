const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-telegram-init-data",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function json(data, status=200){
  return new Response(JSON.stringify(data), {status, headers:{"content-type":"application/json; charset=utf-8", ...cors}});
}

async function hmac(keyBytes, data){
  const key = await crypto.subtle.importKey("raw", keyBytes, {name:"HMAC", hash:"SHA-256"}, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
}
function hex(bytes){ return [...bytes].map(b=>b.toString(16).padStart(2,"0")).join(""); }
function eq(a,b){ if(a.length!==b.length)return false; let x=0; for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i); return x===0; }

async function verifyTelegram(initData, botToken){
  if(!initData || !botToken) return null;
  const p = new URLSearchParams(initData);
  const hash = p.get("hash");
  if(!hash) return null;
  p.delete("hash");
  const dataCheck = [...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\\n");
  const secret = await hmac(new TextEncoder().encode("WebAppData"), botToken);
  const calculated = hex(await hmac(secret, dataCheck));
  if(!eq(calculated, hash)) return null;
  const authDate = Number(p.get("auth_date")||0);
  if(!authDate || Date.now()/1000-authDate > 86400) return null;
  let user; try { user=JSON.parse(p.get("user")||"{}"); } catch { return null; }
  if(!user.id) return null;
  return user;
}

async function getUser(request, env){
  const initData=request.headers.get("x-telegram-init-data") || "";
  return verifyTelegram(initData, env.BOT_TOKEN);
}

export default {
  async fetch(request, env){
    if(request.method === "OPTIONS") return new Response(null,{headers:cors});
    const url=new URL(request.url);
    try{
      if(url.pathname==="/api/health") return json({ok:true});
      if(url.pathname==="/api/leaderboard" && request.method==="GET"){
        const me=await getUser(request,env);
        const rows=await env.DB.prepare(`SELECT telegram_id, username, first_name, photo_url, gg FROM players ORDER BY gg DESC, updated_at ASC LIMIT 50`).all();
        const list=(rows.results||[]).map((r,i)=>({rank:i+1,name:r.username?"@"+r.username:(r.first_name||"Player"),avatar:r.photo_url||"",gg:r.gg,me:me?String(r.telegram_id)===String(me.id):false}));
        return json(list);
      }
      if(url.pathname==="/api/player" && request.method==="POST"){
        const me=await getUser(request,env);
        if(!me) return json({error:"invalid_telegram_auth"},401);
        const body=await request.json();
        const gg=Math.max(0, Math.floor(Number(body.gg)||0));
        // This endpoint syncs the current client balance. The leaderboard only contains verified Telegram users.
        await env.DB.prepare(`INSERT INTO players(telegram_id,username,first_name,photo_url,gg,updated_at) VALUES(?,?,?,?,?,unixepoch()) ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username,first_name=excluded.first_name,photo_url=excluded.photo_url,gg=excluded.gg,updated_at=unixepoch()`).bind(String(me.id),me.username||null,me.first_name||null,me.photo_url||null,gg).run();
        return json({ok:true,gg});
      }
      return json({error:"not_found"},404);
    }catch(e){ console.error(e); return json({error:"server_error"},500); }
  }
};
