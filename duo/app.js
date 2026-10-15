/* 恋爱营业中 · 云端双人版 V1.0
   This browser uses only a public/publishable Supabase key.
   User role and point changes are enforced in Supabase RLS + RPC.
*/
(function(){
"use strict";
const config=window.LOVE_CONFIG||{};
const root=document.getElementById("app");
const status=document.getElementById("statusBar");
const $=id=>document.getElementById(id);
const esc=v=>String(v==null?"":v).replaceAll("老板","老公").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const day=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const notice=(message,error)=>{status.textContent=message;status.classList.toggle("error",!!error);status.hidden=false;window.clearTimeout(notice.timer);notice.timer=window.setTimeout(()=>status.hidden=true,error?7000:3500)};
const pickError=e=>e&&e.message?e.message:String(e||"未知错误");
const st={sb:null,user:null,profile:null,role:"",customerId:null,tab:"home",busy:false,loading:false,menuFilter:"全部",taskFilter:"全部",dishes:[],tasks:[],claims:[],orders:[],events:[],wallet:null,wifeWallet:null,editDishId:null,editTaskId:null,channel:null,rewardItems:[],rewardOrders:[],wishes:[],letters:[],rewardFilter:"全部",wishFilter:"全部",letterTab:"inbox",editRewardId:null,editWishId:null,openLetterId:null,photoUrls:{},kitchen:[],reviews:[],xpRecords:[],selectedDishId:null,editProposalId:null};
/* Save only an email address when the visitor opts in. Never store the password. */
const rememberedEmailKey="lovebusiness_duo_remembered_email_v1";
function getRememberedEmail(){
 try{return String(localStorage.getItem(rememberedEmailKey)||"").slice(0,254)}
 catch(e){return ""}
}
function setRememberedEmail(email,remember){
 try{
  if(remember)localStorage.setItem(rememberedEmailKey,email);
  else localStorage.removeItem(rememberedEmailKey);
 }catch(e){}
}

let refreshTimer=null;

function title(t,sub){return '<div class="page-title"><h2>'+t+'</h2><p>'+sub+'</p></div>'}
function unavailable(){root.innerHTML='<section class="setup"><div class="sticker">☁️</div><h2>双人云端版正在准备中</h2><p>你们现在仍可使用原来的《恋爱营业中》网站。云端版需要先完成独立 Supabase 项目、数据库和双人账号设置。</p><a class="primary-link" href="../">返回现有情侣小店 →</a><p class="small">系统配置完成后，这里会自动出现安全登录页面。</p></section>'}
function errorView(text){root.innerHTML='<section class="setup"><div class="sticker">🥺</div><h2>连接暂时失败</h2><p>'+esc(text)+'</p><button class="btn" data-action="restart">重试连接</button><a class="flat-link" href="../">先返回现有网站</a></section>'}

function loginView(){
  const rememberedEmail=getRememberedEmail();
  root.innerHTML='<section class="login-card"><div class="login-emoji">💌</div><h2>欢迎回到我们的店</h2><p>正常情况下登录一次即可保持登录；如果需要再次验证，记住邮箱后只用填写密码。</p>'
  +'<form id="loginForm"><label>登录邮箱</label><input type="email" name="email" placeholder="your@email.com" autocomplete="username" maxlength="254" value="'+esc(rememberedEmail)+'" required>'
  +'<label>密码</label><input type="password" name="password" placeholder="请输入你的账号密码" autocomplete="current-password" required minlength="6">'
  +'<label class="check remember-email"><input type="checkbox" name="rememberEmail" '+(rememberedEmail?'checked':'checked')+'> 记住邮箱（仅保存在这台设备）</label>'
  +'<button class="btn full" type="submit">登录小店 ♡</button></form>'
  +'<p class="small">✓ 自动保持登录状态　✓ 可记住邮箱<br>不额外存储密码；在共用设备上建议退出登录并取消勾选「记住邮箱」。</p>'
  +'<p class="small">只允许老公和老婆两个专属账号登录。</p>'
  +'<a class="flat-link" href="../">返回原版网页</a></section>';
}
function needRole(){
  root.innerHTML='<section class="setup"><div class="sticker">🔐</div><h2>账号还没有分配身份</h2><p>登录成功！但是这个账号还未在数据库里标记为「老公」或「老婆」。请在 Supabase 后台为两个账号分别分配身份。</p>'
  +'<p class="small">目前不会允许这个账号修改菜单、审批任务或领取积分。</p>'
  +'<button class="btn" data-action="reload-role">重新检查身份</button><button class="btn secondary" data-action="logout">退出账号</button></section>';
}
function loading(){root.innerHTML='<section class="setup"><div class="sticker">🌿</div><h2>正在打开你们的小店…</h2><p>连接我们的专属云端数据。</p></section>'}
function caption(){return st.role==="owner"?"🧑‍🍳 老公控制台":"👑 老婆专属入口"}
function shell(body){
  const owner=st.role==="owner";
  const links=owner?[["home","🏠","首页"],["kitchen","🍳","厨房"],["claims","💌","任务审核"],["dishes","📋","菜单管理"],["tasks","📝","任务管理"]]:[["home","🏠","首页"],["menu","🍜","点餐"],["recipes","🥬","创意菜单"],["orders","🛍️","订单"],["earn","💗","赚积分"]];
  root.innerHTML='<header class="top"><div class="header-copy"><span class="eyebrow">♥ OUR LITTLE LOVE SHOP</span><h1>恋爱营业中 ✿</h1><div class="header-sub">'+caption()+'</div></div><img class="header-photo" src="data:image/webp;base64,UklGRhAFAABXRUJQVlA4IAQFAADQJQCdASqCAK0APu1ysFGppyojpZPLyUAdiWUG+Okqz1Ya5H5u9irEIb1MyXiEcIDeZeVPI/iqGyPGnVICdbi8PF9nu+jYuv/2Vreg1SCtPIELE0ZLMFnG2uHjQVQWwCYkTZPHJTt0nUZoegsFyPfUV/HN1Zxi8Lhe7u+5kxP0srybLBqTwcOsKak7GzG1ZYWW4u6NXqz0rWdbPqhpuGrIf4930efVXrODokLAD18eE8A7F8e4Xv6SZKQEhDXz8eIln2npL5DDentV4hYtrxU1HAqDFjmWyLWvLOF+GdjGWjUHw6nFKLjvtwVSSitcEsd1dwyhJlQRWzldz0i9PItdeyU4L9syBtrPTlQezbaIXOAZOwOnx1Dzg1XDgdd6iz+SRRxfHJyHRqWX6wLFgZ+p4lvpAvWAGAD+61KFbhYURJ9cZv14c7qjowaFcEnvoHaIiBFHUFyJy0GkpfK37GPYAeEt071dTUg16LJ8Y9Nidfr+rVaWab4w7K7LObe8As6YAT09zhok1n5FkcvfRQLnmqGBj5FnaQIgYFoKIQGZ9PJE9o5eX/uJi3u1a3YFdhcgBUlEbWsPFanFmVABhixPylghr9sHC2JPOFnHvA+7+z8V8iBCFrGe2Nu4WCBI+yvh1QkzvrduvTd45cDNCYwCR9vHdH5SI9HNw0mDjVx5FUZT/O6CmzYM52d5edxldA7kjaJAT7Wb3OR6HpJXIvytbVcrL0GSIgb6x9rgwg+JVOtfLQXmIns2m0sIQlNwlkRDyWapq1T8xnZPVp6UH3QnMGLgexQ31RpeeGsmmuKr7uaP9kNd2YAM5I3JBenwKSpUEUNgNa9UiGcxjPVCV7coHRj7x8+IZ/RmlX6GcVt8dYxUp5ZgufJzNr4AHXp6hfOnjabxpuTirDTOEPQvIBnPp+DHdz/GjySFnFGcz9T3GuhXXY+SPE0uceNJonEwfBZ4yHC1vQWvtZKC5sYLAVCA6Pd97HVcRYoG6il1zKuScaXQW1t+9dIaQucQvHPPP+Njc/ZydJ+NCMsGjg/UahHhTiRorxAA3gHTw0zDIiNcPrMZrKy5AuEKvc0rhYYF10sSIJu3ChK3RIBGWC+bd2Y4KyVDJcwdaNdQXmwubPBz12eVoMT2GAyIKDmXtibnkI7PAuPybF/fzUiahFkm+FE2NSuIb13NOoSzj1jsw3KAdgKAfmkKyx5Vo8BNbDSNstn5/sCSBhNAEDPlXqvIKhs2dnaOva1dIRDis4JjjKaVT+2Z+lS0jKJAri1GHBve57SsIzQCOtIshCLEqckjWTFBghKdW0RZ0CFb9Go27HEy5yozXQcx6NpthvTHkCvMyKTh30G6uti1NU/4cjN3HYfCP0kL/EhyyhgrKWKDspsqh9ETraYd2M/aWmsyYUfUHFc7aT3nWrrK2MbTzjzav+Dw7pLwHFai7Mth8gFkC+D3tqT6JkAk+NqXJsOtzr/rvHeVfNGtHXtS9DOPROE6Qp3KNtiiqqck+DsiL+BqjxQRCKFib8CF10s37lj0HNuslJN4f4HCprErQHqDY/obionobD2uszxZh3KJP0pUQLxrJW3Kd9nqb881MR7uddcaHw826/8HjHoIbCr6bwoYGl1OxKEjisAnt9GQ/B/mh3svKaUsQsXNVmSFnPw3yh4V1KT2Zr59ePOYQtbXyqL6oK5uUanj/12V99llj0sNrOfE0GnoAAA=" alt="我们的合照"></header>'
  +'<div class="user-strip"><span>● 双人云端已连接</span><span>'+esc(st.profile?.display_name||caption())+'</span><button class="logout" data-action="logout">退出</button></div>'
  +'<div class="page">'+body+'</div>'
  +'<nav class="bottom-nav">'+links.map(i=>'<button class="'+(st.tab===i[0]?"selected":"")+'" data-action="nav" data-tab="'+i[0]+'"><span>'+i[1]+'</span><small>'+i[2]+'</small></button>').join("")+'</nav>';
}
function balance(){return st.wallet?.balance??0}
function tags(kind,current){
 const source=kind==="dishes"?st.dishes:st.tasks,field=kind==="dishes"?"category":"category";
 const tabs=["全部",...new Set(source.map(v=>v[field]||"其他"))];
 return '<div class="pills">'+tabs.map(c=>'<button class="pill '+(current===c?"on":"")+'" data-action="'+(kind==="dishes"?"dish-filter":"task-filter")+'" data-value="'+esc(c)+'">'+esc(c)+'</button>').join("")+'</div>'
}
function cardTask(t,customer){
 const claim=st.claims.find(c=>c.task_id===t.id&&c.claim_day===day());
 const status=claim?(claim.status==="pending"?"⏳ 待审核":claim.status==="approved"?"✓ 已到账":"今日已驳回"):"申请积分";
 return '<article class="item"><div class="item-emoji">'+esc(t.emoji||"💌")+'</div><div class="item-body"><div class="micro">'+esc(t.category)+'</div><h3>'+esc(t.name)+'</h3><p>'+esc(t.description)+'</p><strong>+ '+t.reward+' ◎</strong></div>'
 +(customer?'<button class="btn small-btn" data-action="claim" data-id="'+t.id+'" '+(claim?"disabled":"")+'>'+status+'</button>':'')+'</article>';
}
function home(){
 const owner=st.role==="owner";
 const pendingOrders=st.orders.filter(o=>o.status==="pending").length;
 const pendingClaims=st.claims.filter(c=>c.status==="pending").length;
 if(owner){
  return '<section class="welcome"><span class="little-tag">✦ HUSBAND STATION</span><h2>老公，欢迎回店！</h2><p>你的专属小店今天也要认真营业。</p></section>'
  +'<div class="stats"><div><strong>'+pendingOrders+'</strong><span>待接单</span></div><div><strong>'+pendingClaims+'</strong><span>待审任务</span></div><div><strong>'+st.dishes.filter(d=>d.available).length+'</strong><span>在售菜品</span></div></div>'
  +'<div class="balance-card"><div>🍳 老公赚到的积分</div><strong>'+balance()+' ◎</strong><p>做饭送达后，老婆支付的积分就进你的钱包 · 愿望实现双方也能得分</p><div class="small">老婆目前：'+(st.wifeWallet?.balance??0)+' ◎</div></div>'
  +'<div class="quick"><button data-action="nav" data-tab="kitchen">👨‍🍳 厨房工作台</button><button data-action="nav" data-tab="chef">🏆 厨师荣誉墙</button><button data-action="nav" data-tab="orders">📦 订单记录</button><button data-action="nav" data-tab="claims">💌 审核任务</button><button data-action="nav" data-tab="dishes">🍳 编辑菜单</button><button data-action="nav" data-tab="tasks">📝 自定义任务</button><button data-action="nav" data-tab="shop">🛍️ 用我的积分换礼物</button><button data-action="nav" data-tab="wallet">◎ 我的积分流水</button><button data-action="nav" data-tab="rewardManage">🎁 管理商城</button><button data-action="nav" data-tab="rewardOrders">🎟️ 兑换待兑现 ('+st.rewardOrders.filter(x=>x.status==="pending").length+')</button><button data-action="nav" data-tab="wishes">🌳 我们的愿望树</button><button data-action="nav" data-tab="letters">📮 悄悄话 ('+st.letters.filter(x=>x.recipient_id===st.user.id&&!x.read_at&&moment(x.unlock_at)<=Date.now()).length+')</button></div>';
 }
 const got=st.events.some(e=>e.source_key==="login:"+day());
 return '<section class="welcome"><span class="little-tag">✦ LIMITED FOR TWO</span><h2>欢迎回家，尊贵的老婆 ♡</h2><p>今日份的温柔小店，只为你营业。</p></section>'
 +'<section class="balance-card"><div>你现在拥有的宠爱币</div><strong>'+balance()+' ◎</strong><button class="btn cream" data-action="sign" '+(got?"disabled":"")+'>'+(got?"今日已签到 ✓":"签到 +50 积分")+'</button></section>'
 +'<div class="quick"><button data-action="nav" data-tab="menu">🍜 今天吃什么</button><button data-action="nav" data-tab="recipes">🥬 老婆自创菜单</button><button data-action="nav" data-tab="orders">❤️ 吃完评价</button><button data-action="nav" data-tab="earn">💗 做任务赚积分</button><button data-action="nav" data-tab="shop">🎁 宠爱币商城</button><button data-action="nav" data-tab="wishes">🌳 我们的愿望树</button><button data-action="nav" data-tab="letters">📮 悄悄话 ('+st.letters.filter(x=>x.recipient_id===st.user.id&&!x.read_at&&moment(x.unlock_at)<=Date.now()).length+')</button><button data-action="nav" data-tab="orders">🛍️ 我的订单</button><button data-action="nav" data-tab="wallet">🪙 积分记录</button></div>'
 +'<div class="tip">☁️ 积分双向流动：老婆点菜扣积分、老公做饭送达后赚同额积分；一起完成愿望，两个人各得30积分。</div>';
}
function kitchenOpen(){return st.kitchen?.[0]?.is_open!==false}
function todayDishFlag(d,key){return d.daily_tag_date===day()&&d[key]===true}
function dishScore(id){
 const ratings=st.reviews.filter(r=>r.dish_id===id);
 if(!ratings.length)return "暂无评分";
 const avg=ratings.reduce((a,r)=>a+r.score,0)/ratings.length;
 return "❤️ "+avg.toFixed(1)+" / 10 · "+ratings.length+"次评价";
}
function menu(){
 const dishes=st.dishes.filter(d=>d.approval_status==="approved"&&d.available&&(st.menuFilter==="全部"||d.category===st.menuFilter))
 .sort((a,b)=>(Number(todayDishFlag(b,"featured_today"))-Number(todayDishFlag(a,"featured_today")))||(a.position-b.position));
 return title("🍜 老公的专属厨房","老婆能预约点菜、选择辣度，吃完还可以打10分评价。")
 +'<div class="sub-balance">你有 <strong>'+balance()+' ◎</strong> · '+(kitchenOpen()?"🟢 营业中":"🌙 暂时休息")+'</div>'
 +'<div class="quick mini"><button data-action="nav" data-tab="recipes">🥬 设计新菜</button><button data-action="nav" data-tab="orders">❤️ 我的美食评价</button></div>'
 +tags("dishes",st.menuFilter)
 +(dishes.length?dishes.map(d=>'<article class="item"><div class="item-emoji">'+esc(d.emoji)+'</div><div class="item-body"><div class="micro">'+(todayDishFlag(d,"featured_today")?"🌟 今日推荐 · ":"")+(d.creator_id?"👑 老婆点名 · ":"👨‍🍳 老公原创 · ")+esc(d.category)+'</div><h3>'+esc(d.name)+'</h3><p>'+esc(d.description)+'</p><div class="small">'+dishScore(d.id)+'</div><strong>'+d.price+' ◎</strong></div><button class="btn small-btn" data-action="select-dish" data-id="'+d.id+'" '+(!kitchenOpen()||todayDishFlag(d,"sold_out_today")?"disabled":"")+'>'+(todayDishFlag(d,"sold_out_today")?"已售罄":kitchenOpen()?"点菜":"休息中")+'</button></article>').join(""):'<div class="empty">当前分类没有上架的菜品，等老公补货吧 🌱</div>');
}
function orderDish(){
 const d=st.dishes.find(x=>x.id===st.selectedDishId);
 if(!d||d.approval_status!=="approved"||!d.available)return menu();
 return backHome()+title("🍽️ 老婆的专属点菜单","可以选择口味、忌口和希望用餐的时间。")
 +'<article class="item"><div class="item-emoji">'+esc(d.emoji)+'</div><div class="item-body"><div class="micro">'+esc(d.category)+'</div><h3>'+esc(d.name)+'</h3><p>'+esc(d.description)+'</p><strong>'+d.price+' ◎</strong></div></article>'
 +'<section class="editor"><form id="kitchenOrderForm"><input type="hidden" name="dishId" value="'+esc(d.id)+'">'
 +'<label>🌶️ 今天想吃多辣？</label><select name="spice">'+["正常","不辣","微辣","中辣","特辣"].map(x=>'<option>'+x+'</option>').join("")+'</select>'
 +'<label>口味与忌口</label><div class="taste-checks">'+["不要香菜","少盐","少油","多放辣椒"].map(t=>'<label class="check"><input name="taste" value="'+t+'" type="checkbox"> '+t+'</label>').join("")+'</div>'
 +'<label>其他要求（不放什么、喜欢什么）</label><textarea name="tasteExtra" maxlength="180" rows="2" placeholder="例如：不放葱、想多一点豆腐"></textarea>'
 +'<label>📅 预约用餐时间（留空＝尽快）</label><input type="datetime-local" name="requestedAt"><p class="small">预约是你希望的用餐时间，老公确认后安排；可在订单里协商改期。</p>'
 +'<label>悄悄对老公说</label><textarea name="note" maxlength="300" rows="2" placeholder="老公，今天想吃热乎乎的！"></textarea>'
 +'<button class="btn full" type="submit" '+(!kitchenOpen()||todayDishFlag(d,"sold_out_today")?"disabled":"")+'>确认下单 · '+d.price+' ◎</button></form></section>';
}
function wifeRecipes(){
 const my=st.dishes.filter(x=>x.creator_id===st.user.id);
 const selected=my.find(x=>x.id===st.editProposalId);
 const state={pending:"⏳ 等老公确认",approved:"✅ 老公已同意",declined:"💌 暂时做不了"};
 return backHome()+title("🥬 老婆的创意菜单","想到什么好吃的，就告诉老公来实现。由老公确定价格与能不能做。")
 +'<section class="editor"><div class="line"><h3>'+(selected?"✏️ 编辑点名菜":"➕ 我想吃一道新菜")+'</h3>'+(selected?'<button class="btn subtle" data-action="new-proposal">取消编辑</button>':"")+'</div>'
 +'<form id="proposalForm"><label>菜名</label><input name="name" required maxlength="50" value="'+esc(selected?.name||"")+'" placeholder="例如：老婆特制酸辣米线">'
 +'<label>分类</label><input name="category" required maxlength="30" value="'+esc(selected?.category||"老婆点名菜")+'">'
 +'<label>图标</label><input name="emoji" maxlength="12" value="'+esc(selected?.emoji||"🍜")+'">'
 +'<label>菜品介绍、想吃的口味</label><textarea name="description" maxlength="240" rows="3" placeholder="想吃的做法、食材、理由">'+esc(selected?.description||"")+'</textarea>'
 +(selected?.approval_status==="approved"?'<div class="tip">修改已通过的菜会重新进入老公审核，审核前暂时无法点这道菜。</div>':"")
 +'<button type="submit" class="btn full">'+(selected?"重新提交确认":"交给老公确认 ♡")+'</button></form></section>'
 +'<h3 class="section-title">我点名的菜 · '+my.length+'道</h3>'
 +(my.length?my.map(d=>'<article class="order-card"><div class="line"><b>'+esc(d.emoji)+' '+esc(d.name)+'</b><span class="status-pill">'+state[d.approval_status]+'</span></div><p>'+esc(d.description||"")+'</p><div class="small">'+(d.approval_status==="approved"?d.price+" ◎":"等待老公定价")+(d.approval_note?" · 老公说："+esc(d.approval_note):"")+'</div><div class="actions"><button class="btn subtle" data-action="edit-proposal" data-id="'+d.id+'">修改</button>'
 +(d.approval_status!=="approved"?'<button class="btn subtle" data-action="withdraw-proposal" data-id="'+d.id+'">撤回</button>':"")+'</div></article>').join(""):'<div class="empty">还没有点名菜，来发明第一道吧！</div>');
}
function earn(){
 const list=st.tasks.filter(t=>t.active&&(st.taskFilter==="全部"||t.category===st.taskFilter));
 return title("💗 心动赚积分","一点点可爱的小互动，攒积分换陈哥手作美食。")
 +'<div class="sub-balance">当前余额 <strong>'+balance()+' ◎</strong></div>'+tags("tasks",st.taskFilter)
 +(list.length?list.map(t=>cardTask(t,true)).join(""):'<div class="empty">这个分类暂时没有任务</div>')
 +'<div class="tip">所有互动需双方自愿。亲密邀约奖励的是发出邀请，不要求进一步亲密，也不需要提供证明。</div>';
}
const states={pending:"待接单",preparing:"制作中",ready:"已做好待取",completed:"已送达",cancelled:"已取消"};
const dtK=v=>v?new Date(v).toLocaleString("zh-CN",{timeZone:"Asia/Seoul",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"";
function orders(){
 const owner=st.role==="owner";
 const rows=[...st.orders].sort((a,b)=>(["pending","preparing","ready"].includes(b.status)?1:0)-(["pending","preparing","ready"].includes(a.status)?1:0)||new Date(b.created_at)-new Date(a.created_at));
 return backHome()+title(owner?"📦 厨房订单记录":"🛍️ 我的点餐与美食评分",owner?"送达后获得菜价积分和主厨经验，之后由老婆给分。":"完成送达后给这次用餐打1—10分，会为老公解锁额外积分。")
 +(rows.length?rows.map(o=>{
 const review=st.reviews.find(r=>r.order_id===o.id);
 const scheduling=o.requested_at?"📅 希望 "+dtK(o.requested_at):"尽快制作";
 const scheduledProposal=o.proposed_at?'🗓️ 老公建议改为 '+dtK(o.proposed_at):"";
 return '<article class="order-card"><div class="line"><b>'+esc(o.dish_name)+'</b><span class="status-pill">'+(states[o.status]||esc(o.status))+'</span></div>'
 +'<div class="small">下单 '+dtK(o.created_at)+'</div><p>口味：'+esc(o.spice_level||"正常")+(o.taste_notes?" · "+esc(o.taste_notes):"")+'</p>'
 +'<p>备注：'+esc(o.note||"无")+'</p><p>'+esc(scheduling)+'</p>'
 +(scheduledProposal?'<p>'+esc(scheduledProposal)+'</p>':"")
 +(o.status==="pending"&&!owner&&o.proposed_at?'<div class="actions"><button class="btn small-btn" data-action="accept-time" data-id="'+o.id+'">接受改期</button><button class="btn subtle" data-action="reject-time" data-id="'+o.id+'">保持原时间</button></div>':"")
 +(o.status==="pending"&&owner?'<div class="schedule-inline"><label>提出新用餐时间</label><input type="datetime-local" id="time-'+o.id+'"><button class="btn subtle" data-action="propose-time" data-id="'+o.id+'">发送时间建议</button></div>':"")
 +(review?'<div class="kitchen-review"><b>❤️ 老婆评分 '+review.score+'/10</b><p>'+esc(review.note||"这顿饭我吃得很开心")+'</p><div class="small">评分奖励给老公 +'+review.bonus+' ◎</div>' +(!owner?'<button class="btn subtle" data-action="edit-review-note" data-id="'+o.id+'">编辑评语</button>':"")+'</div>':"")
 +(!owner&&o.status==="completed"&&!review?'<form class="kitchen-review" id="reviewForm"><input type="hidden" name="orderId" value="'+o.id+'"><label>❤️ 这顿饭给老公几分？（满分10分）</label><input name="score" type="number" min="1" max="10" value="10" required><label>一句美食点评</label><textarea name="reviewNote" maxlength="350" rows="2" placeholder="老公今天做得怎么样？"></textarea><button class="btn full" type="submit">提交评分并奖励老公</button></form>':"")
 +'<div class="line"><strong>'+o.price+' ◎</strong><div class="actions">'
 +(owner&&["pending","preparing","ready"].includes(o.status)?'<button class="btn small-btn" data-action="advance" data-id="'+o.id+'">'+({pending:"开始制作",preparing:"已做好待取",ready:"确认送达＋结算"}[o.status])+'</button>':"")
 +((owner&&["pending","preparing","ready"].includes(o.status)||!owner&&o.status==="pending")?'<button class="btn subtle" data-action="cancel" data-id="'+o.id+'">取消退款</button>':"")
 +'</div></div></article>';
 }).join(""):'<div class="empty">还没有订单，老婆来点第一道菜吧！</div>');
}
function kitchenBoard(){
 const waiting=st.dishes.filter(d=>d.creator_id&&d.approval_status==="pending");
 const active=st.orders.filter(o=>["pending","preparing","ready"].includes(o.status));
 return backHome()+title("👨‍🍳 老公的厨房工作台","新菜审核、待制作订单与今日供应安排都在这里。")
 +'<section class="balance-card"><div>我的厨房收入积分</div><strong>'+balance()+' ◎</strong><p>'+(kitchenOpen()?"🟢 今天营业中":"🌙 厨房暂时休息")+'</p><button class="btn cream" data-action="toggle-kitchen">'+(kitchenOpen()?"暂停接单":"开始营业")+'</button></section>'
 +'<div class="stats"><div><strong>'+active.length+'</strong><span>进行中订单</span></div><div><strong>'+waiting.length+'</strong><span>待审核新菜</span></div><div><strong>'+st.orders.filter(x=>x.status==="completed").length+'</strong><span>历史送达</span></div></div>'
 +'<div class="quick mini"><button data-action="nav" data-tab="orders">📦 厨房订单</button><button data-action="nav" data-tab="dishes">📋 菜单供应管理</button><button data-action="nav" data-tab="chef">🏆 主厨荣誉墙</button></div>'
 +'<h3 class="section-title">🥬 老婆的自创菜等待确认 · '+waiting.length+'</h3>'
 +(waiting.length?waiting.map(d=>'<article class="order-card"><div class="line"><b>'+esc(d.emoji)+' '+esc(d.name)+'</b><span class="status-pill">待老公确认</span></div><p>'+esc(d.description)+'</p><div class="small">'+esc(d.category)+'</div><div class="actions"><button class="btn small-btn" data-action="approve-proposal" data-id="'+d.id+'">可以做 · 设定积分</button><button class="btn subtle" data-action="reject-proposal" data-id="'+d.id+'">暂时做不了</button></div></article>').join(""):'<div class="empty">目前没有待审核的新菜 🌱</div>')
 +'<h3 class="section-title">🔥 正在进行的订单 · '+active.length+'</h3>'
 +(active.length?active.map(o=>'<article class="order-card"><div class="line"><b>'+esc(o.dish_name)+'</b><span class="status-pill">'+states[o.status]+'</span></div><p>'+esc(o.spice_level||"正常")+(o.taste_notes?" · "+esc(o.taste_notes):"")+' · '+(o.requested_at?dtK(o.requested_at):"尽快")+'</p><button class="btn full" data-action="advance" data-id="'+o.id+'">'+({pending:"开始制作",preparing:"已做好待取",ready:"确认送达 · 赚"+o.price+"◎"}[o.status])+'</button></article>').join(""):'<div class="empty">厨房暂时清闲，等待老婆的新订单。</div>');
}
function chefHall(){
 const total=st.xpRecords.reduce((v,x)=>v+x.xp,0);
 const lv=[{min:600,name:"L5 私房料理大师"},{min:300,name:"L4 金牌主厨"},{min:150,name:"L3 爱心大厨"},{min:50,name:"L2 暖心主厨"},{min:0,name:"L1 新晋主厨"}].find(v=>total>=v.min);
 const next=[50,150,300,600].find(x=>x>total);
 const chefEvents=st.events.filter(x=>x.reason?.startsWith("完成做饭收入"));
 const reviewBonus=st.reviews.reduce((a,x)=>a+x.bonus,0);
 const avg=st.reviews.length?(st.reviews.reduce((a,x)=>a+x.score,0)/st.reviews.length).toFixed(1):"—";
 const count=st.orders.filter(x=>x.status==="completed").length;
 const ranks=st.dishes.map(d=>({d,notes:st.reviews.filter(r=>r.dish_id===d.id)}))
 .filter(x=>x.notes.length).sort((a,b)=>(b.notes.reduce((v,r)=>v+r.score,0)/b.notes.length)-(a.notes.reduce((v,r)=>v+r.score,0)/a.notes.length)).slice(0,5);
 return backHome()+title("🏆 老公的主厨荣誉墙","每顿饭都是认真经营的爱，XP与可消费积分分别记录。")
 +'<section class="balance-card"><div>👨‍🍳 当前称号</div><h2>'+lv.name+'</h2><strong>'+total+' XP</strong><p>'+(next?"距离下一等级还有 "+(next-total)+" XP":"已经达到最高等级！")+'</p></section>'
 +'<div class="stats"><div><strong>'+count+'</strong><span>已送达</span></div><div><strong>'+avg+'</strong><span>平均评分</span></div><div><strong>+'+reviewBonus+'</strong><span>评价奖励◎</span></div></div>'
 +'<div class="tip">送达一单+10XP，每天最多3单可得XP；已送达订单的菜价积分照常到账。老婆评分满分10分，可额外奖励最多20积分，每日最多3笔有奖评分。</div>'
 +'<h3 class="section-title">🍲 老婆最爱的菜品榜</h3>'
 +(ranks.length?ranks.map((x,i)=>'<article class="order-card"><div class="line"><b>'+["🥇","🥈","🥉","🏅","🏅"][i]+' '+esc(x.d.name)+'</b><strong>'+(x.notes.reduce((v,r)=>v+r.score,0)/x.notes.length).toFixed(1)+'/10</strong></div><div class="small">'+x.notes.length+'次真实评价</div></article>').join(""):'<div class="empty">期待老婆留下第一次美食评分 ♡</div>')
 +'<div class="small">已记录做饭收入流水 '+chefEvents.length+' 笔。旧订单继续保留，历史成交不补发XP或评分积分。</div>';
}
function claims(){
 const pending=st.claims.filter(c=>c.status==="pending");
 const history=st.claims.filter(c=>c.status!=="pending");
 const row=c=>'<article class="order-card"><div class="line"><b>'+esc(c.task_name)+'</b><span class="status-pill">'+({pending:"待审核",approved:"已发积分",rejected:"未通过"}[c.status]||c.status)+'</span></div>'
 +'<div class="small">'+new Date(c.submitted_at).toLocaleString()+'</div><div class="line"><strong>+'+c.reward+' ◎</strong><div class="actions">'
 +(c.status==="pending"?'<button class="btn small-btn" data-action="approve" data-id="'+c.id+'">通过</button><button class="btn subtle" data-action="reject" data-id="'+c.id+'">驳回</button>':'')+'</div></div></article>';
 return title("💌 任务审核","你批准的奖励会直接发到老婆的云端积分账户。")
 +'<h3 class="section-title">待审核（'+pending.length+'）</h3>'+(pending.length?pending.map(row).join(""):'<div class="empty">暂时没有待审核的心动任务</div>')
 +'<h3 class="section-title">审核记录</h3>'+(history.length?history.slice(0,30).map(row).join(""):'<p class="small">还没有审核记录</p>');
}
function wallet(){
 return backHome()+title("🪙 我的积分账户",isOwner()?"完成做饭和一起实现愿望，可以获得自己的积分，去商城兑换。":"签到、奖励、点菜和兑换都由云端记录。")
 +'<section class="balance-card"><div>宠爱币余额</div><strong>'+balance()+' ◎</strong></section>'
 +(st.events.filter(e=>e.customer_id===st.user.id).length?st.events.filter(e=>e.customer_id===st.user.id).map(e=>'<div class="log-row"><div><b>'+esc(e.reason)+'</b><div class="small">'+new Date(e.created_at).toLocaleString()+'</div></div><strong class="'+(e.delta>0?"plus":"minus")+'">'+(e.delta>0?"+":"")+e.delta+'</strong></div>').join(""):'<div class="empty">还没有积分流水，去实现愿望或完成一单吧 ✨</div>');
}
function editDishes(){
 const selected=st.dishes.find(d=>d.id===st.editDishId);
 const rows=st.dishes.filter(d=>d.approval_status==="approved").map(d=>'<article class="manage-row"><span class="emoji">'+esc(d.emoji)+'</span><div class="manage-main"><b>'+esc(d.name)+'</b><div class="small">'+esc(d.category)+' · '+d.price+' ◎ · '+(d.available?"在售":"已下架")+(todayDishFlag(d,"sold_out_today")?" · 今日售罄":"")+(todayDishFlag(d,"featured_today")?" · 今日推荐":"")+'</div></div>'
 +'<button class="btn subtle" data-action="toggle-featured" data-id="'+d.id+'">'+(todayDishFlag(d,"featured_today")?"取消推荐":"🌟 推荐")+'</button><button class="btn subtle" data-action="toggle-soldout" data-id="'+d.id+'">'+(todayDishFlag(d,"sold_out_today")?"恢复供应":"标为售罄")+'</button><button class="btn subtle" data-action="edit-dish" data-id="'+d.id+'">编辑</button><button class="btn subtle" data-action="delete-dish" data-id="'+d.id+'">删除</button></article>').join("");
 return title("🍳 菜单管理","新增、修改、删除菜品后，老婆手机会自动更新。")
 +'<section class="editor"><div class="line"><h3>'+(selected?"✏️ 编辑菜品":"➕ 添加菜品")+'</h3>'+(selected?'<button class="btn subtle" data-action="new-dish">取消编辑</button>':'')+'</div>'
 +'<form id="dishForm"><label>菜名</label><input name="name" maxlength="50" required value="'+esc(selected?.name||"")+'" placeholder="例如：陈哥红烧肉">'
 +'<div class="two"><div><label>分类</label><input name="category" maxlength="30" required value="'+esc(selected?.category||"素菜类")+'"></div><div><label>积分价格</label><input type="number" name="price" min="1" max="100000" required value="'+(selected?.price??60)+'"></div></div>'
 +'<div class="two"><div><label>图标</label><input name="emoji" maxlength="12" value="'+esc(selected?.emoji||"🍲")+'"></div><div><label>排序序号</label><input name="position" type="number" value="'+(selected?.position??st.dishes.length+1)+'"></div></div>'
 +'<label>菜品介绍</label><textarea name="description" maxlength="240" rows="2">'+esc(selected?.description||"老公亲手制作")+'</textarea>'
 +'<label class="check"><input name="available" type="checkbox" '+(selected?.available!==false?"checked":"")+'> 在菜单里展示这道菜</label>'
 +'<button class="btn full" type="submit">'+(selected?"保存修改":"发布新菜")+'</button></form></section>'
 +'<h3 class="section-title">全部菜品 · '+st.dishes.length+'道</h3>'+rows;
}
function editTasks(){
 const selected=st.tasks.find(t=>t.id===st.editTaskId);
 const rows=st.tasks.map(t=>'<article class="manage-row"><span class="emoji">'+esc(t.emoji)+'</span><div class="manage-main"><b>'+esc(t.name)+'</b><div class="small">'+esc(t.category)+' · +'+t.reward+' ◎ · '+(t.active?"展示中":"已隐藏")+'</div></div>'
 +'<button class="btn subtle" data-action="edit-task" data-id="'+t.id+'">编辑</button><button class="btn subtle" data-action="delete-task" data-id="'+t.id+'">删除</button></article>').join("");
 return title("📝 自定义积分任务","新增小情趣任务、修改积分或隐藏任务，云端会自动同步。")
 +'<section class="editor"><div class="line"><h3>'+(selected?"✏️ 编辑任务":"➕ 新增任务")+'</h3>'+(selected?'<button class="btn subtle" data-action="new-task">取消编辑</button>':'')+'</div>'
 +'<form id="taskForm"><label>任务名称</label><input name="name" maxlength="60" required value="'+esc(selected?.name||"")+'" placeholder="例如：给老公一个抱抱">'
 +'<div class="two"><div><label>任务类别</label><input name="category" maxlength="30" required value="'+esc(selected?.category||"甜蜜互动")+'"></div><div><label>奖励积分</label><input type="number" name="reward" min="1" max="10000" required value="'+(selected?.reward??30)+'"></div></div>'
 +'<div class="two"><div><label>图标</label><input name="emoji" maxlength="12" value="'+esc(selected?.emoji||"💌")+'"></div><div><label>排序序号</label><input name="position" type="number" value="'+(selected?.position??st.tasks.length+1)+'"></div></div>'
 +'<label>任务说明</label><textarea name="description" maxlength="300" rows="2">'+esc(selected?.description||"完成后申请老公审核")+'</textarea>'
 +'<label class="check"><input name="active" type="checkbox" '+(selected?.active!==false?"checked":"")+'> 展示此任务</label>'
 +'<label class="check"><input name="inviteOnly" type="checkbox" '+(selected?.invite_only===true?"checked":"")+'> 属于自愿邀请任务（只需提出邀请）</label>'
 +'<button class="btn full" type="submit">'+(selected?"保存任务":"发布任务")+'</button></form></section>'
 +'<h3 class="section-title">全部任务 · '+st.tasks.length+'项</h3>'+rows;
}

/* ——— LOVE EXTRAS V3: rewards / wishes / letters ——— */
const datetime=v=>v?new Date(v).toLocaleString("zh-CN",{timeZone:"Asia/Seoul",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}):"";
const moment=v=>new Date(v).getTime();
const backHome=()=>'<button class="btn subtle" data-action="nav" data-tab="home">← 返回首页</button>';
const catPills=(arr,chosen,action)=>'<div class="pills">'+["全部",...new Set(arr.map(x=>x.category||"其他"))].map(x=>'<button class="pill '+(chosen===x?"on":"")+'" data-action="'+action+'" data-value="'+esc(x)+'">'+esc(x)+'</button>').join("")+'</div>';
const isOwner=()=>st.role==="owner";
const statusReward={pending:"待老公兑现",fulfilled:"已经兑现",refunded:"已退款"};
const statusWish={open:"等待认领",claimed:"实现中",done:"已实现"};
function rewardShop(){
 const visible=st.rewardItems.filter(x=>x.available&&(x.audience==="both"||x.audience===st.role)&&(st.rewardFilter==="全部"||x.category===st.rewardFilter));
 return backHome()+title("🎁 我们的宠爱商城","老公和老婆都能使用自己赚到的积分兑换福利，由另一方兑现。")
  +'<div class="sub-balance">可用宠爱币 <strong>'+balance()+' ◎</strong></div>'
  +(isOwner()?'<div class="quick mini"><button data-action="nav" data-tab="rewardManage">✏️ 自定义商品</button><button data-action="nav" data-tab="rewardOrders">🎟️ 双人兑换订单</button></div>':'<button class="btn subtle spaced" data-action="nav" data-tab="rewardOrders">🎟️ 双人兑换订单</button>')
  +catPills(st.rewardItems,st.rewardFilter,"reward-filter")
  +(visible.length?visible.map(x=>'<article class="item"><div class="item-emoji">'+esc(x.emoji||"🎁")+'</div><div class="item-body"><div class="micro">'+esc(x.category)+'</div><h3>'+esc(x.name)+'</h3><p>'+esc(x.description)+'</p><strong>'+x.price+' ◎</strong><div class="small">'+(x.stock===null?"不限量":x.stock>0?"剩余 "+x.stock+" 份":"已兑完")+'</div></div>'
   +'<button class="btn small-btn" data-action="redeem" data-id="'+x.id+'" '+(x.stock===0?"disabled":"")+'>'+(x.stock===0?"售罄":"兑换")+'</button></article>').join(""):'<div class="empty">这里还没有上架的福利，等老公来补货！</div>')
  +'<div class="tip">双方可以各自兑换适用商品，另一方负责兑现或退款；兑换后立即扣积分，历史订单保留原价。亲密互动须双方自愿。</div>';
}
function rewardManage(){
 const selected=st.rewardItems.find(x=>x.id===st.editRewardId);
 const rows=st.rewardItems.map(x=>'<article class="manage-row"><span class="emoji">'+esc(x.emoji||"🎁")+'</span><div class="manage-main"><b>'+esc(x.name)+'</b><div class="small">'+esc(x.category)+' · '+x.price+' ◎ · '+({owner:"老公专属",customer:"老婆专属",both:"双方可兑"}[x.audience]||"双方可兑")+' · '+(x.available?"已上架":"已下架")+' · '+(x.stock===null?"不限库存":"库存 "+x.stock)+'</div></div><button class="btn subtle" data-action="edit-reward" data-id="'+x.id+'">编辑</button><button class="btn subtle" data-action="delete-reward" data-id="'+x.id+'">删除</button></article>').join("");
 return backHome()+title("🛠️ 老公自定义商城","菜可以随时换，商城也由你说了算。价格、库存、分类、说明全部可以修改。")
 +'<section class="editor"><div class="line"><h3>'+(selected?"✏️ 编辑商品":"➕ 新增商城商品")+'</h3>'+(selected?'<button class="btn subtle" data-action="new-reward">取消编辑</button>':"")+'</div>'
 +'<form id="rewardForm"><label>商品名称</label><input name="name" maxlength="60" required value="'+esc(selected?.name||"")+'" placeholder="例如：老公独家免洗碗券">'
 +'<div class="two"><div><label>分类</label><input name="category" maxlength="30" value="'+esc(selected?.category||"甜蜜福利")+'" required></div><div><label>需要积分</label><input type="number" name="price" min="1" max="100000" required value="'+(selected?.price??80)+'"></div></div>'
 +'<div class="two"><div><label>小图标</label><input name="emoji" maxlength="12" value="'+esc(selected?.emoji||"🎁")+'"></div><div><label>排序数字</label><input type="number" name="position" value="'+(selected?.position??st.rewardItems.length+1)+'"></div></div>'
 +'<label>库存数量（留空＝不限量）</label><input type="number" name="stock" min="0" step="1" placeholder="留空为无限库存" value="'+(selected?.stock??"")+'">'
 +'<label>谁可以兑换</label><select name="audience"><option value="both" '+(!selected||selected.audience==="both"?"selected":"")+'>我们两个都可以</option><option value="customer" '+(selected?.audience==="customer"?"selected":"")+'>仅老婆兑换</option><option value="owner" '+(selected?.audience==="owner"?"selected":"")+'>仅老公兑换</option></select>'
 +'<label>兑换内容与使用说明</label><textarea name="description" maxlength="280" rows="3" placeholder="例如：兑换后老公亲自准备">'+esc(selected?.description||"")+'</textarea>'
 +'<label class="check"><input name="available" type="checkbox" '+(selected?.available!==false?"checked":"")+'> 在老婆的商城展示</label>'
 +'<button class="btn full" type="submit">'+(selected?"保存商品修改":"新增商品上架")+'</button></form></section>'
 +'<div class="line"><h3 class="section-title">商品列表 · '+st.rewardItems.length+' 件</h3><button class="btn subtle" data-action="clear-rewards">清空重做</button></div>'
 +(rows||'<div class="empty">还没有商品，来创建第一件吧。</div>')
 +'<details class="editor"><summary><b>📋 批量添加商品</b></summary><p class="small">每行：分类 | 商品名称 | 积分 | 图标 | 库存（空为不限量）</p>'
 +'<textarea id="rewardBulk" rows="5" placeholder="吃喝福利 | 奶茶券 | 80 | 🧋&#10;生活特权 | 免洗碗券 | 100 | 🧽 | 5"></textarea>'
 +'<button class="btn full" data-action="import-rewards">批量加入商城</button></details>'
 +'<div class="tip">只有老公可以管理商品。删除、清空不影响已有兑换券，库存、积分和历史流水保存在云端。</div>';
}
function rewardOrders(){
 const mine=st.rewardOrders.filter(o=>o.customer_id===st.user.id);
 const forMe=st.rewardOrders.filter(o=>o.customer_id!==st.user.id);
 const section=(arr,label)=>'<h3 class="section-title">'+label+'（'+arr.length+'）</h3>'+(arr.length?arr.map(o=>'<article class="order-card"><div class="line"><b>'+esc(o.item_name)+'</b><span class="status-pill">'+statusReward[o.status]+'</span></div><div class="small">'+datetime(o.created_at)+'</div><p>备注：'+esc(o.note||"无")+'</p><div class="line"><strong>'+o.price+' ◎</strong><div class="actions">'
 +(o.customer_id!==st.user.id&&o.status==="pending"?'<button class="btn small-btn" data-action="fulfill-reward" data-id="'+o.id+'">已兑现</button><button class="btn subtle" data-action="refund-reward" data-id="'+o.id+'">退积分</button>':"")
 +'</div></div></article>').join(""):'<div class="empty">暂时没有兑换券</div>');
 return backHome()+title("🎟️ 双人兑换券","我们各自用积分兑换福利，由另一方确认兑现或者退款。")
 +section(forMe,isOwner()?"等我兑现 · 老婆的兑换":"等我兑现 · 老公的兑换")
 +section(mine,"我的兑换券");
}

/* One private JPEG per wish; original phone photo never leaves the device uncompressed. */
const WISH_PHOTO_BUCKET="love-wish-photos";
function wishPhotoHtml(w){
 if(!w.photo_path)return "";
 const signed=st.photoUrls[w.photo_path]?.url;
 return signed?'<img class="wish-photo" src="'+esc(signed)+'" alt="愿望照片：'+esc(w.title)+'" loading="lazy">':
   '<div class="small wish-photo-wait">📷 正在加载愿望照片…</div>';
}
async function loadWishPhotoUrls(){
 const now=Date.now();
 const paths=[...new Set(st.wishes.map(w=>w.photo_path).filter(Boolean))];
 const active=new Set(paths);
 for(const old of Object.keys(st.photoUrls))if(!active.has(old))delete st.photoUrls[old];
 await Promise.all(paths.filter(path=>!st.photoUrls[path]||st.photoUrls[path].expires<=now).map(async path=>{
   try{
     const {data,error}=await st.sb.storage.from(WISH_PHOTO_BUCKET).createSignedUrl(path,3600);
     if(error)throw error;
     if(data?.signedUrl)st.photoUrls[path]={url:data.signedUrl,expires:Date.now()+48*60*1000};
   }catch(e){console.warn("愿望照片暂时无法加载",pickError(e))}
 }));
}
function compressWishPhoto(file){
 return new Promise((resolve,reject)=>{
   if(!file||!file.type.startsWith("image/"))return reject(Error("请选一张图片"));
   if(file.size>12*1024*1024)return reject(Error("原图不能超过12MB，请先缩小"));
   const src=URL.createObjectURL(file);
   const img=new Image();
   const clean=()=>URL.revokeObjectURL(src);
   img.onload=()=>{
     try{
       const limit=1200;
       const scale=Math.min(1,limit/Math.max(img.naturalWidth,img.naturalHeight));
       const canvas=document.createElement("canvas");
       canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
       canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
       const ctx=canvas.getContext("2d");
       if(!ctx)throw Error("当前手机不支持图片压缩");
       ctx.drawImage(img,0,0,canvas.width,canvas.height);
       canvas.toBlob(blob=>{
         clean();
         if(!blob)return reject(Error("照片压缩失败，请换一张"));
         if(blob.size>2*1024*1024)return reject(Error("照片压缩后仍超过2MB，请换一张"));
         resolve(blob);
       },"image/jpeg",0.78);
     }catch(e){clean();reject(e)}
   };
   img.onerror=()=>{clean();reject(Error("无法读取照片，请改用JPG或PNG图片"))};
   img.src=src;
 });
}
async function setWishPhotoBlob(wishId,blob){
 const wish=st.wishes.find(w=>w.id===wishId);
 if(wish&&wish.author_id!==st.user.id)throw Error("只有许愿者才能修改照片");
 if(!window.crypto?.randomUUID)throw Error("浏览器版本太旧，无法安全上传图片");
 const path=st.user.id+"/"+wishId+"/"+window.crypto.randomUUID()+".jpg";
 const store=st.sb.storage.from(WISH_PHOTO_BUCKET);
 const uploaded=await store.upload(path,blob,{contentType:"image/jpeg",cacheControl:"3600",upsert:false});
 if(uploaded.error)throw uploaded.error;
 try{
   await callRPC("love_set_wish_photo",{p_id:wishId,p_photo_path:path});
 }catch(e){
   await store.remove([path]).catch(()=>{});
   throw e;
 }
 if(wish?.photo_path&&wish.photo_path!==path){
   // Replacing the photo only removes the old object after the DB points to the new one.
   const cleared=await store.remove([wish.photo_path]);
   if(cleared.error)console.warn("旧照片清理失败",pickError(cleared.error));
   delete st.photoUrls[wish.photo_path];
 }
}
async function setWishPhoto(wishId,file){
 const blob=await compressWishPhoto(file);
 return setWishPhotoBlob(wishId,blob);
}
async function removeWishPhoto(wish){
 if(!wish||wish.author_id!==st.user.id)throw Error("只有许愿者能删除照片");
 if(!wish.photo_path)return;
 await callRPC("love_set_wish_photo",{p_id:wish.id,p_photo_path:null});
 const res=await st.sb.storage.from(WISH_PHOTO_BUCKET).remove([wish.photo_path]);
 if(res.error)console.warn("历史照片清理失败",pickError(res.error));
 delete st.photoUrls[wish.photo_path];
}

function wishesView(){
 const filtered=st.wishes.filter(w=>st.wishFilter==="全部"||w.status===st.wishFilter);
 const labels=[["全部","全部"],["open","待认领"],["claimed","实现中"],["done","回忆树"]];
 const editing=st.wishes.find(w=>w.id===st.editWishId&&w.author_id===st.user.id&&w.status==="open");
 return backHome()+title("🌳 两个人的愿望树","一个人许愿、另一个人认领；实现后，双方各获得30宠爱币。")
 +'<div class="wish-banner">🌱 完成一个愿望，老公 +30 ◎，老婆 +30 ◎。每个愿望只奖励一次。</div>'
 +'<section class="editor"><div class="line"><h3>'+(editing?"✏️ 修改小愿望":"🌱 种下一颗愿望")+'</h3>'+(editing?'<button class="btn subtle" data-action="new-wish">取消</button>':"")+'</div>'
 +'<form id="wishForm"><label>我想要……</label><input name="title" maxlength="90" required placeholder="例如：和你去海边看日落" value="'+esc(editing?.title||"")+'">'
 +'<label>写一点心情</label><textarea name="description" maxlength="500" rows="2" placeholder="什么时候去都好，只要是我们两个人">'+esc(editing?.description||"")+'</textarea>'
 +'<div class="two"><div><label>分类</label><select name="category">'+["小愿望","一起出游","好吃的","居家日常","神秘惊喜"].map(x=>'<option '+(editing?.category===x?"selected":"")+'>'+esc(x)+'</option>').join("")+'</select></div>'
 +'<div><label>希望日期（可不填）</label><input type="date" name="desiredDate" value="'+esc(editing?.desired_date||"")+'"></div></div>'
 +'<label>📷 愿望照片（可选，每个愿望最多一张）</label><input type="file" name="photo" accept="image/*" aria-label="选择愿望照片">'
 +(editing&&editing.photo_path?wishPhotoHtml(editing):"")
 +'<p class="small">上传后自动压缩，只对老公和老婆的登录账号可见；之后也可以更换照片。</p>'
 +'<button class="btn full" type="submit">'+(editing?"保存愿望":"种下愿望 ♡")+'</button></form></section>'
 +'<div class="pills">'+labels.map(([id,label])=>'<button class="pill '+(st.wishFilter===id?"on":"")+'" data-action="wish-filter" data-value="'+id+'">'+label+'</button>').join("")+'</div>'
 +(filtered.length?filtered.map(w=>{
   const mine=w.author_id===st.user.id;
   const author=mine?"我写下的":"TA 写下的";
   const date=w.desired_date?' · 希望 '+esc(w.desired_date):"";
   return '<article class="wish-item"><div class="line"><b>'+({open:"🌱",claimed:"🌿",done:"🌳"}[w.status])+' '+esc(w.title)+'</b><span class="status-pill">'+statusWish[w.status]+'</span></div>'
   +wishPhotoHtml(w)
   +'<p>'+esc(w.description||"")+'</p><div class="small">'+author+' · '+esc(w.category)+date+'</div>'
   +(w.status==="done"?'<p class="wish-memory">♡ '+esc(w.memory_note||"这件心愿已经实现啦")+'</p>':"")
   +(mine?'<div class="wish-photo-controls"><label class="photo-label">📷 '+(w.photo_path?"更换照片":"添加照片")+'<input type="file" accept="image/*" data-wish-photo="'+w.id+'" aria-label="上传愿望照片"></label>'
    +(w.photo_path?'<button class="btn subtle" data-action="remove-wish-photo" data-id="'+w.id+'">移除照片</button>':"")+'</div>':"")
   +'<div class="actions wish-actions">'+(w.status==="open"&&!mine?'<button class="btn small-btn" data-action="claim-wish" data-id="'+w.id+'">我来实现</button>':"")
   +(w.status==="open"&&mine?'<button class="btn subtle" data-action="edit-wish" data-id="'+w.id+'">编辑</button><button class="btn subtle" data-action="delete-wish" data-id="'+w.id+'">删除</button>':"")
   +(w.status==="claimed"&&mine?'<button class="btn small-btn" data-action="finish-wish" data-id="'+w.id+'">确认已实现 ✨</button>':"")
   +'</div></article>'
 }).join(""):'<div class="empty">这里还没有对应的愿望，种下一颗试试吧 🌱</div>');
}
function lettersView(){
 const me=st.user.id;
 const inbox=st.letters.filter(x=>x.recipient_id===me),sent=st.letters.filter(x=>x.sender_id===me);
 const opened=st.letters.find(x=>x.id===st.openLetterId);
 const locked=l=>l.recipient_id===me&&moment(l.unlock_at)>Date.now();
 let body=backHome()+title("📮 只属于我们的悄悄话","你有些话只想告诉我，我也有些话只想给你听。")
 +'<div class="pills">'+[["inbox","📩 收件箱"],["compose","✍️ 写一封"],["sent","💌 已寄出"]].map(([tab,label])=>'<button class="pill '+(st.letterTab===tab?"on":"")+'" data-action="letter-tab" data-value="'+tab+'">'+label+'</button>').join("")+'</div>';
 if(st.letterTab==="compose"){
  body+='<section class="editor letter-paper"><h3>写一封小小的信</h3><form id="letterForm"><label>想对TA说……</label>'
   +'<textarea name="body" rows="7" required maxlength="1000" placeholder="今天其实有一句话，一直想说给你听……"></textarea>'
   +'<label>何时解锁（留空＝立即送达）</label><input name="unlockAt" type="datetime-local">'
   +'<p class="small">按本机当地时间选择。定时信件到点之前，对方只能看到「有一封信待解锁」，看不到正文。</p>'
   +'<button class="btn full" type="submit">寄给你最爱的人 💌</button></form></section>';
 }else if(opened && (st.letterTab==="inbox"||st.letterTab==="sent")){
  if(locked(opened))body+='<div class="empty">🔒 这封信还不能打开，预计 '+datetime(opened.unlock_at)+' 解锁。</div>';
  else body+='<article class="letter-paper"><div class="line"><h3>💌 '+(opened.sender_id===me?"寄给TA的一封信":"TA 寄来的小情话")+'</h3><button class="btn subtle" data-action="close-letter">返回列表</button></div>'
   +'<div class="small">写于 '+datetime(opened.created_at)+'</div><p class="letter-content">'+esc(opened.body||"")+'</p><div class="letter-sign">♥ ONLY FOR US</div></article>';
 }else{
  const data=st.letterTab==="sent"?sent:inbox;
  body+=(data.length?data.map(l=>{
   const blocked=locked(l),unread=st.letterTab==="inbox"&&!l.read_at&&!blocked;
   return '<button class="letter-card" data-action="open-letter" data-id="'+l.id+'" '+(blocked?"disabled":"")+'><span class="letter-icon">'+(blocked?"🔒":unread?"💌":"✉️")+'</span><span class="letter-main"><b>'+ (blocked?"一封等待解锁的信":l.sender_id===me?"写给 TA 的悄悄话":"来自 TA 的悄悄话")+'</b><small>'+datetime(l.created_at)+(blocked?" · "+datetime(l.unlock_at)+" 解锁":unread?" · 未读":"")+'</small></span><span>›</span></button>';
  }).join(""):'<div class="empty">信箱还是空空的，写下第一封吧 💌</div>');
 }
 body+='<div class="tip">信件只在你们的两个登录账号中可见；普通云端存储不是端到端加密。定时信件到解锁时间前无法从服务器读取正文。</div>';
 return body;
}

function render(){
 if(!st.user){loginView();return;}
 if(!st.profile){needRole();return;}
 const views={home,menu,orderDish,recipes:wifeRecipes,kitchen:kitchenBoard,chef:chefHall,earn,orders,claims,wallet,dishes:editDishes,tasks:editTasks,shop:rewardShop,rewardManage,rewardOrders,wishes:wishesView,letters:lettersView};
 const body=(views[st.tab]||home)();
 shell(body);
}
async function loadProfile(){
 const {data,error}=await st.sb.from("love_profiles").select("role,display_name").eq("id",st.user.id).maybeSingle();
 if(error)throw error;
 st.profile=data;st.role=data?.role||"";
 if(!data)return;
 if(st.role==="customer")st.customerId=st.user.id;
 else{
   const q=await st.sb.from("love_profiles").select("id").eq("role","customer").maybeSingle();
   if(q.error)throw q.error;
   st.customerId=q.data?.id||null;
 }
 st.tab="home";
}
async function fetchData(force){
 if(!st.profile||st.loading)return;
 st.loading=true;
 try{
   const pairs=[["dishes",st.sb.from("love_dishes").select("*").order("position",{ascending:true})],
    ["tasks",st.sb.from("love_tasks").select("*").order("position",{ascending:true})],
    ["orders",st.sb.from("love_orders").select("*").order("created_at",{ascending:false}).limit(100)],
    ["claims",st.sb.from("love_task_claims").select("*").order("submitted_at",{ascending:false}).limit(150)],
    ["events",st.sb.from("love_wallet_events").select("*").order("created_at",{ascending:false}).limit(100)],
    ["rewardItems",st.sb.from("love_reward_items").select("*").order("position",{ascending:true})],
    ["rewardOrders",st.sb.from("love_reward_redemptions").select("*").order("created_at",{ascending:false}).limit(150)],
    ["wishes",st.sb.from("love_wishes").select("*").order("created_at",{ascending:false}).limit(150)],
    ["letters",st.sb.rpc("love_get_letters")],
    ["kitchen",st.sb.from("love_kitchen_settings").select("*")],
    ["reviews",st.sb.from("love_dish_reviews").select("*").order("created_at",{ascending:false}).limit(200)],
    ["xpRecords",st.sb.from("love_chef_experience").select("*")]
   ];
   if(st.user?.id)pairs.push(["wallet",st.sb.from("love_wallets").select("*").eq("customer_id",st.user.id).maybeSingle()]);
   if(st.role==="owner"&&st.customerId)pairs.push(["wifeWallet",st.sb.from("love_wallets").select("*").eq("customer_id",st.customerId).maybeSingle()]);
   const results=await Promise.all(pairs.map(async([key,q])=>[key,await q]));
   for(const [key,response] of results){
     if(response.error)throw response.error;
     st[key]=response.data||((key==="wallet")?null:[]);
   }
   await loadWishPhotoUrls();
   if(force||!["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName))render();
 }catch(e){notice("同步失败："+pickError(e),true)}
 finally{st.loading=false}
}
function subscribe(){
 if(st.channel){st.sb.removeChannel(st.channel)}
 let c=st.sb.channel("couple-live-"+st.user.id);
 for(const name of ["love_wallets","love_wallet_events","love_dishes","love_tasks","love_orders","love_task_claims","love_reward_items","love_reward_redemptions","love_wishes","love_dish_reviews","love_chef_experience","love_kitchen_settings"])
   c=c.on("postgres_changes",{event:"*",schema:"public",table:name},()=>{fetchData(false)});
 st.channel=c.subscribe();
 window.clearInterval(refreshTimer);
 refreshTimer=window.setInterval(()=>{if(st.profile&&!document.hidden)fetchData(false)},10000);
}
async function init(){
 if(!config.supabaseUrl||!config.publishableKey){unavailable();return}
 if(!window.supabase||!window.supabase.createClient){errorView("云端客户端脚本未加载，请检查网络连接。");return}
 try{
   st.sb=window.supabase.createClient(config.supabaseUrl,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
   const r=await st.sb.auth.getSession();if(r.error)throw r.error;
   st.user=r.data.session?.user||null;
   if(st.user){loading();await loadProfile();if(st.profile){subscribe();await fetchData(true)}else needRole();}
   else loginView();
 }catch(e){errorView(pickError(e))}
}
async function operation(action){
 if(st.busy)return;
 st.busy=true;
 try{
  await action();
  await fetchData(true);
 }catch(e){notice(pickError(e),true)}
 finally{st.busy=false}
}
async function callRPC(name,params){
 const {data,error}=await st.sb.rpc(name,params||{});
 if(error)throw error;
 return data;
}
document.addEventListener("submit",async e=>{
 if(!["loginForm","dishForm","taskForm","rewardForm","wishForm","letterForm","proposalForm","kitchenOrderForm","reviewForm"].includes(e.target?.id))return;
 e.preventDefault();
 const form=e.target,fd=new FormData(form);
 if(form.id==="loginForm"){
   if(st.busy)return;
   st.busy=true;
   try{
     const {data,error}=await st.sb.auth.signInWithPassword({email:String(fd.get("email")).trim(),password:String(fd.get("password"))});
     if(error)throw error;
     setRememberedEmail(String(fd.get("email")).trim(),fd.has("rememberEmail"));
     st.user=data.user;loading();await loadProfile();if(st.profile){subscribe();await fetchData(true)}else needRole();
   }catch(e){notice("登录失败："+pickError(e),true)}
   finally{st.busy=false}
 }else if(form.id==="proposalForm"){
   await operation(async()=>{
     await callRPC("love_propose_dish",{p_id:st.editProposalId,p_name:String(fd.get("name")).trim(),
       p_category:String(fd.get("category")).trim(),p_emoji:String(fd.get("emoji")).trim()||"🍽️",
       p_description:String(fd.get("description")||"").trim()});
     st.editProposalId=null;notice("老婆的点名菜已经送给老公审核 🥬");
   });
 }else if(form.id==="kitchenOrderForm"){
   await operation(async()=>{
     const dishId=String(fd.get("dishId")||"");
     const d=st.dishes.find(x=>x.id===dishId);
     if(!d)throw Error("菜品不存在");
     const rawDate=String(fd.get("requestedAt")||"");
     const requested=rawDate?new Date(rawDate):null;
     if(requested&&isNaN(requested.getTime()))throw Error("预约时间不正确");
     const tastes=fd.getAll("taste").filter(Boolean).map(String);
     const extra=String(fd.get("tasteExtra")||"").trim();
     if(extra)tastes.push(extra);
     if(d.price>balance())throw Error("积分不足，请先赚积分");
     if(!window.confirm("确认花费 "+d.price+" ◎点「"+d.name+"」？老公送达后才到账。"))return;
     await callRPC("love_place_kitchen_order",{p_dish_id:dishId,
       p_note:String(fd.get("note")||"").trim(),p_spice_level:String(fd.get("spice")||"正常"),
       p_taste_notes:tastes.join(" · "),p_requested_at:requested?.toISOString()||null});
     st.tab="orders";st.selectedDishId=null;notice("点菜成功！老公会看到你的口味与预约信息 ♡");
   });
 }else if(form.id==="reviewForm"){
   await operation(async()=>{
     const score=Number(fd.get("score"));
     const orderId=String(fd.get("orderId"));
     if(!Number.isInteger(score)||score<1||score>10)throw Error("评分必须在1—10之间");
     if(!window.confirm("确认给这次用餐打 "+score+" 分？评分提交后不能修改分数，也不会重复发积分。"))return;
     const extra=await callRPC("love_rate_dish",{p_order_id:orderId,
       p_score:score,p_note:String(fd.get("reviewNote")||"").trim()});
     notice("评分成功！老公额外获得 "+extra+" ◎ ❤️");
   });
 }else if(form.id==="rewardForm"){
   await operation(async()=>{
     const stockValue=String(fd.get("stock")??"").trim();
     const stock=stockValue===""?null:Number(stockValue);
     if(stock!==null&&(!Number.isInteger(stock)||stock<0))throw Error("库存必须是非负整数，或留空表示不限量");
     const params={p_id:st.editRewardId,p_name:String(fd.get("name")).trim(),
       p_category:String(fd.get("category")).trim(),p_price:Number(fd.get("price")),
       p_emoji:String(fd.get("emoji")).trim()||"🎁",p_description:String(fd.get("description")).trim(),
       p_stock:stock,p_available:fd.has("available"),p_position:Number(fd.get("position"))||0,p_audience:String(fd.get("audience")||"both")};
     const {error}=await st.sb.rpc("love_save_reward",params);
     if(error)throw error;
     st.editRewardId=null;notice("商城商品已更新，老婆手机也会同步 ✓");
   });
 }else if(form.id==="wishForm"){
   await operation(async()=>{
     const title=String(fd.get("title")).trim(),details=String(fd.get("description")).trim(),
       category=String(fd.get("category")).trim(),date=String(fd.get("desiredDate")).trim()||null;
     const rawPhoto=fd.get("photo");
     const photo=rawPhoto&&rawPhoto.size?rawPhoto:null;
     // Validate/compress before creating the wish, so invalid photos do not cause half-finished drafts.
     const readyPhoto=photo?await compressWishPhoto(photo):null;
     const wishId=st.editWishId||await callRPC("love_create_wish",{p_title:title,
       p_description:details,p_category:category,p_desired_date:date});
     if(st.editWishId)await callRPC("love_edit_wish",{p_id:st.editWishId,p_title:title,
       p_description:details,p_category:category,p_desired_date:date});
     let warning=null;
     if(readyPhoto){
       try{await setWishPhotoBlob(wishId,readyPhoto);}
       catch(e){warning="愿望已保存，但照片上传失败。可在愿望卡片重新上传："+pickError(e);}
     }
     st.editWishId=null;
     notice(warning||"愿望已经种下啦"+(readyPhoto?"，照片也上传了 📷":" ♡"),!!warning);
   });
 }else if(form.id==="letterForm"){
   await operation(async()=>{
     const body=String(fd.get("body")||"").trim();
     const rawTime=String(fd.get("unlockAt")||"").trim();
     const unlockAt=rawTime?new Date(rawTime).toISOString():null;
     if(!body||body.length>1000)throw Error("请输入1到1000字的悄悄话");
     await callRPC("love_send_letter",{p_body:body,p_unlock_at:unlockAt});
     st.letterTab="sent";st.openLetterId=null;notice("悄悄话已经寄出去啦 💌");
   });
 }else if(form.id==="dishForm"){
   await operation(async()=>{
     const params={p_id:st.editDishId,p_name:String(fd.get("name")).trim(),p_category:String(fd.get("category")).trim(),
     p_price:Number(fd.get("price")),p_emoji:String(fd.get("emoji")).trim()||"🍽️",
     p_description:String(fd.get("description")).trim(),p_available:fd.has("available"),p_position:Number(fd.get("position"))||0};
     const {error}=await st.sb.rpc("love_save_dish",params);if(error)throw error;
     st.editDishId=null;notice("菜品已同步到云端 ✓");
   });
 }else if(form.id==="taskForm"){
   await operation(async()=>{
     const params={p_id:st.editTaskId,p_name:String(fd.get("name")).trim(),p_category:String(fd.get("category")).trim(),
     p_reward:Number(fd.get("reward")),p_emoji:String(fd.get("emoji")).trim()||"💌",
     p_description:String(fd.get("description")).trim(),p_active:fd.has("active"),
     p_invite_only:fd.has("inviteOnly"),p_position:Number(fd.get("position"))||0};
     const {error}=await st.sb.rpc("love_save_task",params);if(error)throw error;
     st.editTaskId=null;notice("积分任务已同步 ✓");
   });
 }
});
document.addEventListener("change",async e=>{
 const input=e.target;
 const wishId=input?.dataset?.wishPhoto;
 if(!wishId)return;
 const file=input.files?.[0];
 if(!file)return;
 input.value="";
 await operation(async()=>{await setWishPhoto(wishId,file);notice("愿望照片已经更新 📷")});
});
document.addEventListener("click",async e=>{
 const btn=e.target.closest("[data-action]");if(!btn)return;
 const type=btn.dataset.action,id=btn.dataset.id;
 if(type==="restart"){init();return}
 if(type==="nav"){st.tab=btn.dataset.tab;st.selectedDishId=null;render();window.scrollTo(0,0);return}
 if(type==="dish-filter"){st.menuFilter=btn.dataset.value;render();return}
 if(type==="task-filter"){st.taskFilter=btn.dataset.value;render();return}
 if(type==="new-dish"){st.editDishId=null;render();return}
 if(type==="new-task"){st.editTaskId=null;render();return}
 if(type==="edit-dish"){st.editDishId=id;render();window.scrollTo(0,0);return}
 if(type==="edit-task"){st.editTaskId=id;render();window.scrollTo(0,0);return}
 if(type==="reload-role"){await operation(async()=>{await loadProfile();if(st.profile)subscribe()});return}
 if(type==="logout"){
   if(st.sb)await st.sb.auth.signOut();
   st.user=null;st.profile=null;st.role="";st.customerId=null;
   if(st.channel)await st.sb.removeChannel(st.channel);
   window.clearInterval(refreshTimer);st.channel=null;st.photoUrls={};st.tab="home";loginView();return;
 }

 if(type==="select-dish"){st.selectedDishId=id;st.tab="orderDish";render();window.scrollTo(0,0);return}
 if(type==="new-proposal"){st.editProposalId=null;render();return}
 if(type==="edit-proposal"){st.editProposalId=id;st.tab="recipes";render();window.scrollTo(0,0);return}
 if(type==="withdraw-proposal"){
   if(!window.confirm("确定撤回这道点名菜？"))return;
   await operation(async()=>{await callRPC("love_withdraw_dish",{p_id:id});st.editProposalId=null;notice("已撤回这道菜")});return;
 }
 if(type==="approve-proposal"||type==="reject-proposal"){
   const dish=st.dishes.find(x=>x.id===id);if(!dish)return;
   const approved=type==="approve-proposal";
   const rawPrice=approved?window.prompt("老公决定这道菜的积分价格（1—100000）","80"):null;
   if(approved&&rawPrice===null)return;
   const price=approved?Number(rawPrice):null;
   if(approved&&(!Number.isInteger(price)||price<1||price>100000)){notice("请输入有效积分价格",true);return}
   const note=window.prompt(approved?"给老婆一句确认备注（可留空）":"告诉老婆暂时做不了的原因（可留空）","");
   if(note===null)return;
   await operation(async()=>{await callRPC("love_review_proposed_dish",{p_id:id,p_approve:approved,p_price:price,p_note:note});notice(approved?"已确认上架！老婆可以下单啦":"已经告诉老婆暂时做不了")});return;
 }
 if(type==="toggle-kitchen"){
   await operation(async()=>{await callRPC("love_kitchen_open",{p_open:!kitchenOpen()});notice(kitchenOpen()?"厨房已暂停接单":"厨房已经开门营业 🍳")});return;
 }
 if(type==="toggle-featured"||type==="toggle-soldout"){
   const dish=st.dishes.find(x=>x.id===id);if(!dish)return;
   await operation(async()=>{await callRPC("love_kitchen_mark_dish",{p_id:id,
     p_featured:type==="toggle-featured"?!todayDishFlag(dish,"featured_today"):todayDishFlag(dish,"featured_today"),
     p_sold_out:type==="toggle-soldout"?!todayDishFlag(dish,"sold_out_today"):todayDishFlag(dish,"sold_out_today")});
     notice("厨房供应信息已同步")});return;
 }
 if(type==="propose-time"){
   const textTime=$("time-"+id)?.value;
   const date=new Date(textTime||"");
   if(isNaN(date.getTime())){notice("请先选择新的用餐时间",true);return}
   await operation(async()=>{await callRPC("love_propose_order_time",{p_order_id:id,p_time:date.toISOString()});notice("改期建议已发给老婆")});return;
 }
 if(type==="accept-time"||type==="reject-time"){
   await operation(async()=>{await callRPC("love_accept_order_time",{p_order_id:id,p_accept:type==="accept-time"});notice(type==="accept-time"?"已确认新用餐时间":"已保留原预约时间")});return;
 }
 if(type==="edit-review-note"){
   const r=st.reviews.find(x=>x.order_id===id);if(!r)return;
   const note=window.prompt("修改评语（分数无法修改，积分不会重复发放）",r.note||"");
   if(note===null)return;
   await operation(async()=>{await callRPC("love_update_review_note",{p_order_id:id,p_note:note});notice("评语更新成功")});return;
 }
 if(type==="reward-filter"){st.rewardFilter=btn.dataset.value;render();return}
 if(type==="wish-filter"){st.wishFilter=btn.dataset.value;render();return}
 if(type==="letter-tab"){st.letterTab=btn.dataset.value;st.openLetterId=null;render();return}
 if(type==="close-letter"){st.openLetterId=null;render();return}
 if(type==="edit-reward"){st.editRewardId=id;st.tab="rewardManage";render();window.scrollTo(0,0);return}
 if(type==="new-reward"){st.editRewardId=null;render();return}
 if(type==="edit-wish"){st.editWishId=id;render();window.scrollTo(0,0);return}
 if(type==="new-wish"){st.editWishId=null;render();return}
 if(type==="open-letter"){
   const letter=st.letters.find(x=>x.id===id);if(!letter)return;
   if(letter.recipient_id===st.user.id&&moment(letter.unlock_at)>Date.now()){notice("信件还没有解锁哦");return}
   st.openLetterId=id;
   if(letter.recipient_id===st.user.id&&!letter.read_at){
     await operation(async()=>{await callRPC("love_read_letter",{p_id:id})});
   }else render();
   return;
 }
 if(type==="redeem"){
   const item=st.rewardItems.find(x=>x.id===id);
   if(!item||!item.available||(item.audience!=="both"&&item.audience!==st.role))return;
   if(balance()<item.price){notice("还差 "+(item.price-balance())+" ◎，去完成心动任务吧！",true);return}
   if(!window.confirm("花费 "+item.price+" ◎兑换「"+item.name+"」？积分立即扣除，等"+(isOwner()?"老婆":"老公")+"兑现。"))return;
   const note=window.prompt("给老公的兑换备注（可不填）","");if(note===null)return;
   await operation(async()=>{
     const token=window.crypto?.randomUUID?.();
     if(!token)throw Error("浏览器不支持安全请求编号，请升级浏览器");
     await callRPC("love_redeem_reward",{p_id:id,p_note:note,p_request_id:token});
     st.tab="rewardOrders";notice("兑换成功！等"+(isOwner()?"老婆":"老公")+"兑现 ♡");
   });return;
 }
 if(type==="fulfill-reward"||type==="refund-reward"){
   const refund=type==="refund-reward";
   if(!window.confirm(refund?"确定退款？积分和库存将退回，且不能重复退款。":"确认已经兑现福利了吗？"))return;
   await operation(async()=>{await callRPC("love_finish_redemption",{p_id:id,p_refund:refund});notice(refund?"已退款并退还积分":"兑换券已兑现！")});
   return;
 }
 if(type==="delete-reward"){
   const it=st.rewardItems.find(x=>x.id===id);
   if(!it||!window.confirm("确定删除「"+it.name+"」吗？历史兑换券不会消失。"))return;
   await operation(async()=>{await callRPC("love_delete_reward",{p_id:id});st.editRewardId=null;notice("商城商品已删除")});return;
 }
 if(type==="clear-rewards"){
   if(!window.confirm("确定清空所有商城商品？历史兑换券不会删除。"))return;
   if(!window.confirm("最后确认：将清空整个商城，之后需要重新添加商品。"))return;
   await operation(async()=>{await callRPC("love_clear_rewards");st.editRewardId=null;notice("商城已清空，可以重新制作")});return;
 }
 if(type==="import-rewards"){
   const raw=$("rewardBulk")?.value.trim();
   if(!raw)return notice("请先填写商品信息",true);
   const lines=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
   if(lines.length>60)return notice("一次最多导入60个商品",true);
   const parsed=[];
   for(let k=0;k<lines.length;k++){
     const cols=lines[k].split(/[|｜]/).map(x=>x.trim());
     const points=Number(cols[2]),stock=cols[4]===""||cols[4]===undefined?null:Number(cols[4]);
     if(cols.length<3||cols.length>5||!cols[0]||!cols[1]||!Number.isInteger(points)||points<1||points>100000||stock!==null&&(!Number.isInteger(stock)||stock<0)){
       notice("第 "+(k+1)+" 行格式错误：分类 | 商品名称 | 积分 | 图标 | 库存",true);return;
     }
     parsed.push({p_id:null,p_name:cols[1],p_category:cols[0],p_price:points,p_emoji:cols[3]||"🎁",
       p_description:"我们的小店兑换福利",p_stock:stock,p_available:true,p_position:st.rewardItems.length+k+1,p_audience:"both"});
   }
   if(!window.confirm("确认批量加入 "+parsed.length+" 个商品？"))return;
   await operation(async()=>{for(const product of parsed)await callRPC("love_save_reward",product);notice("已添加 "+parsed.length+" 件商品")});
   return;
 }
 if(type==="claim-wish"){
   if(!window.confirm("要接下这个愿望，悄悄努力实现吗？"))return;
   await operation(async()=>{await callRPC("love_claim_wish",{p_id:id});notice("愿望已接下，慢慢实现吧 🌿")});return;
 }
 if(type==="finish-wish"){
   const memo=window.prompt("愿望实现啦！留一句回忆（可留空）","");if(memo===null)return;
   await operation(async()=>{await callRPC("love_complete_wish",{p_id:id,p_memory_note:memo});notice("愿望已实现！老公和老婆各得30积分 🌳")});return;
 }
 if(type==="remove-wish-photo"){
   const w=st.wishes.find(x=>x.id===id);
   if(!w||!window.confirm("确定移除这张愿望照片吗？"))return;
   await operation(async()=>{await removeWishPhoto(w);notice("愿望照片已移除")});return;
 }
 if(type==="delete-wish"){
   if(!window.confirm("确定删掉这个还未被认领的愿望吗？"))return;
   const w=st.wishes.find(x=>x.id===id);
   await operation(async()=>{
     if(w?.photo_path){
       const remove=await st.sb.storage.from(WISH_PHOTO_BUCKET).remove([w.photo_path]);
       if(remove.error)throw remove.error;
       delete st.photoUrls[w.photo_path];
     }
     await callRPC("love_delete_wish",{p_id:id});st.editWishId=null;notice("愿望已删除");
   });return;
 }

 const rpc=async(name,args)=>{const {data,error}=await st.sb.rpc(name,args||{});if(error)throw error;return data};
 if(type==="sign"){await operation(async()=>{const r=await rpc("love_daily_checkin");notice(r.awarded?"签到成功！+50积分":"今天已经签到过啦")});return}
 if(type==="buy"){st.selectedDishId=id;st.tab="orderDish";render();return;}
 if(type==="claim"){
   const t=st.tasks.find(x=>x.id===id);if(!t)return;
   const hint=t.invite_only?"只要自愿提出邀请就能申请；是否进一步亲密，由双方自由决定，不要求证明。":"确认已经完成「"+t.name+"」了吗？";
   if(!window.confirm(hint))return;
   await operation(async()=>{await rpc("love_claim_task",{p_task_id:id});notice("申请已提交，等待老公审核")});return;
 }
 if(type==="approve"||type==="reject"){
   if(!window.confirm(type==="approve"?"批准后奖励会立即发到老婆的积分账户，确定吗？":"确定驳回这项任务吗？"))return;
   await operation(async()=>{await rpc("love_review_claim",{p_claim_id:id,p_approve:type==="approve"});notice(type==="approve"?"审核通过！积分已发放":"已驳回申请")});return;
 }
 if(type==="advance"){
   const order=st.orders.find(o=>o.id===id);if(!order)return;
   const delivered=order.status==="ready";
   if(delivered&&!window.confirm("确定已经把「"+order.dish_name+"」送达老婆？确认后老公获得 "+order.price+" ◎，不能重复结算。"))return;
   await operation(async()=>{
     await callRPC("love_advance_order",{p_order_id:id});
     notice(delivered?"已送达！老公赚到 "+order.price+" 积分 🍳":order.status==="pending"?"已经开始制作":"已做好，等待老婆来取餐 ♡");
   });return;
 }
 if(type==="cancel"){
   if(!window.confirm("确认取消订单并退还积分？"))return;
   await operation(async()=>{await rpc("love_cancel_order",{p_order_id:id});notice("订单已取消，积分已退回")});return;
 }
 if(type==="delete-dish"){
   const d=st.dishes.find(x=>x.id===id);
   if(!d||!window.confirm("确定删除「"+d.name+"」吗？不会影响历史订单。"))return;
   await operation(async()=>{await rpc("love_delete_dish",{p_id:id});st.editDishId=null;notice("菜品已删除")});return;
 }
 if(type==="delete-task"){
   const t=st.tasks.find(x=>x.id===id);
   if(!t||!window.confirm("确定删除任务「"+t.name+"」吗？历史任务申请仍会保留。"))return;
   await operation(async()=>{await rpc("love_delete_task",{p_id:id});st.editTaskId=null;notice("任务已删除")});return;
 }
});
init();
})();