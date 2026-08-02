
// GG RUSH - real admin stats endpoint for Cloudflare Worker + D1
// Bind D1 database as DB in wrangler.toml.
// Set OWNER_TELEGRAM_ID as a Worker secret/variable.
// Set BOT_TOKEN as a Worker secret if you validate Telegram initData.

function json(data, status=200){
  return new Response(JSON.stringify(data),{
    status,headers:{"content-type":"application/json","access-control-allow-origin":"*"}
  });
}

async function adminStats(request, env){
  // IMPORTANT: replace this with Telegram initData HMAC validation in production.
  // Never trust a Telegram ID sent directly from the browser.
  const owner = env.OWNER_TELEGRAM_ID;
  const init = request.headers.get("X-Telegram-Init-Data") || "";
  const params = new URLSearchParams(init);
  const userRaw = params.get("user");
  let uid = "";
  try { uid = userRaw ? String(JSON.parse(userRaw).id) : ""; } catch {}
  if(!owner || uid !== String(owner)) return json({error:"forbidden"},403);

  const now = Date.now();
  const onlineSince = now - 90*1000;
  const today = new Date(); today.setHours(0,0,0,0);
  const todayMs = today.getTime();

  // Expected schema:
  // users(id INTEGER PRIMARY KEY, telegram_id TEXT UNIQUE, name TEXT, gg INTEGER,
  //       referrals INTEGER DEFAULT 0, cases_opened INTEGER DEFAULT 0,
  //       taps_total INTEGER DEFAULT 0, created_at INTEGER, last_seen INTEGER)
  // events(id INTEGER PRIMARY KEY, telegram_id TEXT, type TEXT, amount INTEGER, created_at INTEGER)

  const q = async (sql, args=[]) => {
    const r = await env.DB.prepare(sql).bind(...args).first();
    return Number(r?.n || 0);
  };

  const users = await q("SELECT COUNT(*) n FROM users");
  const online = await q("SELECT COUNT(*) n FROM users WHERE last_seen >= ?", [onlineSince]);
  const newToday = await q("SELECT COUNT(*) n FROM users WHERE created_at >= ?", [todayMs]);
  const totalGG = await q("SELECT COALESCE(SUM(gg),0) n FROM users");
  const referrals = await q("SELECT COALESCE(SUM(referrals),0) n FROM users");
  const cases = await q("SELECT COALESCE(SUM(cases_opened),0) n FROM users");
  const tapsToday = await q("SELECT COUNT(*) n FROM events WHERE type='tap' AND created_at >= ?", [todayMs]);

  const topR = await env.DB.prepare(
    "SELECT name, telegram_id, gg FROM users ORDER BY gg DESC LIMIT 10"
  ).all();

  // 24 hourly buckets
  const online24h=[];
  for(let i=23;i>=0;i--){
    const end=now-i*3600000;
    const start=end-3600000;
    const n=await q("SELECT COUNT(*) n FROM users WHERE last_seen >= ? AND last_seen < ?",[start,end]);
    online24h.push(n);
  }

  return json({
    online,users,newToday,tapsToday,totalGG,cases,referrals,
    top:(topR.results||[]).map(x=>({name:x.name,telegramId:x.telegram_id,gg:x.gg})),
    online24h
  });
}

export default {
 async fetch(request,env){
   const url=new URL(request.url);
   if(request.method==="OPTIONS") return new Response("",{headers:{
     "access-control-allow-origin":"*",
     "access-control-allow-headers":"Content-Type,X-Telegram-Init-Data",
     "access-control-allow-methods":"GET,OPTIONS"
   }});
   if(url.pathname==="/admin/stats" && request.method==="GET") return adminStats(request,env);
   return json({ok:true});
 }
}
