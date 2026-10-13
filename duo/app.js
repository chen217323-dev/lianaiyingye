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
const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const day=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const notice=(message,error)=>{status.textContent=message;status.classList.toggle("error",!!error);status.hidden=false;window.clearTimeout(notice.timer);notice.timer=window.setTimeout(()=>status.hidden=true,error?7000:3500)};
const pickError=e=>e&&e.message?e.message:String(e||"未知错误");
const st={sb:null,user:null,profile:null,role:"",customerId:null,tab:"home",busy:false,loading:false,menuFilter:"全部",taskFilter:"全部",dishes:[],tasks:[],claims:[],orders:[],events:[],wallet:null,editDishId:null,editTaskId:null,channel:null};
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
  +'<p class="small">只允许老板和女朋友两个专属账号登录。</p>'
  +'<a class="flat-link" href="../">返回原版网页</a></section>';
}
function needRole(){
  root.innerHTML='<section class="setup"><div class="sticker">🔐</div><h2>账号还没有分配身份</h2><p>登录成功！但是这个账号还未在数据库里标记为「老板」或「女朋友」。请在 Supabase 后台为两个账号分别分配身份。</p>'
  +'<p class="small">目前不会允许这个账号修改菜单、审批任务或领取积分。</p>'
  +'<button class="btn" data-action="reload-role">重新检查身份</button><button class="btn secondary" data-action="logout">退出账号</button></section>';
}
function loading(){root.innerHTML='<section class="setup"><div class="sticker">🌿</div><h2>正在打开你们的小店…</h2><p>连接我们的专属云端数据。</p></section>'}
function caption(){return st.role==="owner"?"🧑‍🍳 老板控制台":"👑 女朋友专属入口"}
function shell(body){
  const owner=st.role==="owner";
  const links=owner?[["home","🏠","首页"],["orders","📦","订单"],["claims","💌","任务审核"],["dishes","🍳","菜单管理"],["tasks","📝","任务管理"]]:[["home","🏠","首页"],["menu","🍜","点餐"],["earn","💗","赚积分"],["orders","🛍️","订单"],["wallet","◎","积分"]];
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
  return '<section class="welcome"><span class="little-tag">✦ BOSS STATION</span><h2>老板，欢迎回店！</h2><p>你的专属小店今天也要认真营业。</p></section>'
  +'<div class="stats"><div><strong>'+pendingOrders+'</strong><span>待接单</span></div><div><strong>'+pendingClaims+'</strong><span>待审任务</span></div><div><strong>'+st.dishes.filter(d=>d.available).length+'</strong><span>在售菜品</span></div></div>'
  +'<div class="balance-card"><div>女朋友当前的宠爱币</div><strong>'+balance()+' ◎</strong><p>审核通过后余额会在她手机更新</p></div>'
  +'<div class="quick"><button data-action="nav" data-tab="orders">📦 处理点餐</button><button data-action="nav" data-tab="claims">💌 审核任务</button><button data-action="nav" data-tab="dishes">🍳 编辑菜单</button><button data-action="nav" data-tab="tasks">📝 自定义任务</button></div>';
 }
 const got=st.events.some(e=>e.source_key==="login:"+day());
 return '<section class="welcome"><span class="little-tag">✦ LIMITED FOR TWO</span><h2>欢迎回家，尊贵的女朋友 ♡</h2><p>今日份的温柔小店，只为你营业。</p></section>'
 +'<section class="balance-card"><div>你现在拥有的宠爱币</div><strong>'+balance()+' ◎</strong><button class="btn cream" data-action="sign" '+(got?"disabled":"")+'>'+(got?"今日已签到 ✓":"签到 +50 积分")+'</button></section>'
 +'<div class="quick"><button data-action="nav" data-tab="menu">🍜 今天吃什么</button><button data-action="nav" data-tab="earn">💗 做任务赚积分</button><button data-action="nav" data-tab="orders">🛍️ 我的订单</button><button data-action="nav" data-tab="wallet">🪙 积分记录</button></div>'
 +'<div class="tip">☁️ 现在由云端统一保存积分。老板审批后，你的积分会自动更新。</div>';
}
function menu(){
 const dishes=st.dishes.filter(d=>d.available&&(st.menuFilter==="全部"||d.category===st.menuFilter));
 return title("🍜 陈哥专属厨房","每天都在营业的爱意，老板手作，认真对待每一口。")
 +'<div class="sub-balance">可用余额 <strong>'+balance()+' ◎</strong></div>'+tags("dishes",st.menuFilter)
 +(dishes.length?dishes.map(d=>'<article class="item"><div class="item-emoji">'+esc(d.emoji)+'</div><div class="item-body"><div class="micro">'+esc(d.category)+'</div><h3>'+esc(d.name)+'</h3><p>'+esc(d.description)+'</p><strong>'+d.price+' ◎</strong></div><button class="btn small-btn" data-action="buy" data-id="'+d.id+'">点菜</button></article>').join(""):'<div class="empty">这个分类的菜还没开卖呢 🍃</div>')
}
function earn(){
 const list=st.tasks.filter(t=>t.active&&(st.taskFilter==="全部"||t.category===st.taskFilter));
 return title("💗 心动赚积分","一点点可爱的小互动，攒积分换陈哥手作美食。")
 +'<div class="sub-balance">当前余额 <strong>'+balance()+' ◎</strong></div>'+tags("tasks",st.taskFilter)
 +(list.length?list.map(t=>cardTask(t,true)).join(""):'<div class="empty">这个分类暂时没有任务</div>')
 +'<div class="tip">所有互动需双方自愿。亲密邀约奖励的是发出邀请，不要求进一步亲密，也不需要提供证明。</div>';
}
const states={pending:"待接单",preparing:"制作中",completed:"已送达",cancelled:"已取消"};
function orders(){
 const owner=st.role==="owner";
 return title(owner?"📦 顾客订单":"🛍️ 我的点餐记录",owner?"女朋友的所有点餐，接单后可以送达或取消。":"从下单到出餐，每一步都能看见。")
 +(st.orders.length?st.orders.map(o=>'<article class="order-card"><div class="line"><b>'+esc(o.dish_name)+'</b><span class="status-pill">'+(states[o.status]||esc(o.status))+'</span></div>'
 +'<div class="small">下单时间 '+new Date(o.created_at).toLocaleString()+'</div><p>备注：'+esc(o.note||"无")+'</p><div class="line"><strong>'+o.price+' ◎</strong><div class="actions">'
 +(owner&&["pending","preparing"].includes(o.status)?'<button class="btn small-btn" data-action="advance" data-id="'+o.id+'">'+(o.status==="pending"?"开始制作":"标记送达")+'</button>':'')
 +((owner&&["pending","preparing"].includes(o.status)||!owner&&o.status==="pending")?'<button class="btn subtle" data-action="cancel" data-id="'+o.id+'">取消退款</button>':'')
 +'</div></div></article>').join(""):'<div class="empty">暂时没有订单，今天想吃些什么？</div>');
}
function claims(){
 const pending=st.claims.filter(c=>c.status==="pending");
 const history=st.claims.filter(c=>c.status!=="pending");
 const row=c=>'<article class="order-card"><div class="line"><b>'+esc(c.task_name)+'</b><span class="status-pill">'+({pending:"待审核",approved:"已发积分",rejected:"未通过"}[c.status]||c.status)+'</span></div>'
 +'<div class="small">'+new Date(c.submitted_at).toLocaleString()+'</div><div class="line"><strong>+'+c.reward+' ◎</strong><div class="actions">'
 +(c.status==="pending"?'<button class="btn small-btn" data-action="approve" data-id="'+c.id+'">通过</button><button class="btn subtle" data-action="reject" data-id="'+c.id+'">驳回</button>':'')+'</div></div></article>';
 return title("💌 任务审核","你批准的奖励会直接发到女朋友的云端积分账户。")
 +'<h3 class="section-title">待审核（'+pending.length+'）</h3>'+(pending.length?pending.map(row).join(""):'<div class="empty">暂时没有待审核的心动任务</div>')
 +'<h3 class="section-title">审核记录</h3>'+(history.length?history.slice(0,30).map(row).join(""):'<p class="small">还没有审核记录</p>');
}
function wallet(){
 return title("🪙 我的积分账户","签到、奖励和点菜扣分都由云端记录。")
 +'<section class="balance-card"><div>宠爱币余额</div><strong>'+balance()+' ◎</strong></section>'
 +(st.events.length?st.events.map(e=>'<div class="log-row"><div><b>'+esc(e.reason)+'</b><div class="small">'+new Date(e.created_at).toLocaleString()+'</div></div><strong class="'+(e.delta>0?"plus":"minus")+'">'+(e.delta>0?"+":"")+e.delta+'</strong></div>').join(""):'<div class="empty">还没有积分记录，先去签到吧 ✨</div>');
}
function editDishes(){
 const selected=st.dishes.find(d=>d.id===st.editDishId);
 const rows=st.dishes.map(d=>'<article class="manage-row"><span class="emoji">'+esc(d.emoji)+'</span><div class="manage-main"><b>'+esc(d.name)+'</b><div class="small">'+esc(d.category)+' · '+d.price+' ◎ · '+(d.available?"在售":"已下架")+'</div></div>'
 +'<button class="btn subtle" data-action="edit-dish" data-id="'+d.id+'">编辑</button><button class="btn subtle" data-action="delete-dish" data-id="'+d.id+'">删除</button></article>').join("");
 return title("🍳 菜单管理","新增、修改、删除菜品后，女朋友手机会自动更新。")
 +'<section class="editor"><div class="line"><h3>'+(selected?"✏️ 编辑菜品":"➕ 添加菜品")+'</h3>'+(selected?'<button class="btn subtle" data-action="new-dish">取消编辑</button>':'')+'</div>'
 +'<form id="dishForm"><label>菜名</label><input name="name" maxlength="50" required value="'+esc(selected?.name||"")+'" placeholder="例如：陈哥红烧肉">'
 +'<div class="two"><div><label>分类</label><input name="category" maxlength="30" required value="'+esc(selected?.category||"素菜类")+'"></div><div><label>积分价格</label><input type="number" name="price" min="1" max="100000" required value="'+(selected?.price??60)+'"></div></div>'
 +'<div class="two"><div><label>图标</label><input name="emoji" maxlength="12" value="'+esc(selected?.emoji||"🍲")+'"></div><div><label>排序序号</label><input name="position" type="number" value="'+(selected?.position??st.dishes.length+1)+'"></div></div>'
 +'<label>菜品介绍</label><textarea name="description" maxlength="240" rows="2">'+esc(selected?.description||"老板亲手制作")+'</textarea>'
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
 +'<form id="taskForm"><label>任务名称</label><input name="name" maxlength="60" required value="'+esc(selected?.name||"")+'" placeholder="例如：给老板一个抱抱">'
 +'<div class="two"><div><label>任务类别</label><input name="category" maxlength="30" required value="'+esc(selected?.category||"甜蜜互动")+'"></div><div><label>奖励积分</label><input type="number" name="reward" min="1" max="10000" required value="'+(selected?.reward??30)+'"></div></div>'
 +'<div class="two"><div><label>图标</label><input name="emoji" maxlength="12" value="'+esc(selected?.emoji||"💌")+'"></div><div><label>排序序号</label><input name="position" type="number" value="'+(selected?.position??st.tasks.length+1)+'"></div></div>'
 +'<label>任务说明</label><textarea name="description" maxlength="300" rows="2">'+esc(selected?.description||"完成后申请老板审核")+'</textarea>'
 +'<label class="check"><input name="active" type="checkbox" '+(selected?.active!==false?"checked":"")+'> 展示此任务</label>'
 +'<label class="check"><input name="inviteOnly" type="checkbox" '+(selected?.invite_only===true?"checked":"")+'> 属于自愿邀请任务（只需提出邀请）</label>'
 +'<button class="btn full" type="submit">'+(selected?"保存任务":"发布任务")+'</button></form></section>'
 +'<h3 class="section-title">全部任务 · '+st.tasks.length+'项</h3>'+rows;
}
function render(){
 if(!st.user){loginView();return;}
 if(!st.profile){needRole();return;}
 const views={home,menu,earn,orders,claims,wallet,dishes:editDishes,tasks:editTasks};
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
    ["events",st.sb.from("love_wallet_events").select("*").order("created_at",{ascending:false}).limit(100)]
   ];
   if(st.customerId)pairs.push(["wallet",st.sb.from("love_wallets").select("*").eq("customer_id",st.customerId).maybeSingle()]);
   const results=await Promise.all(pairs.map(async([key,q])=>[key,await q]));
   for(const [key,response] of results){
     if(response.error)throw response.error;
     st[key]=response.data||((key==="wallet")?null:[]);
   }
   if(force||!["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName))render();
 }catch(e){notice("同步失败："+pickError(e),true)}
 finally{st.loading=false}
}
function subscribe(){
 if(st.channel){st.sb.removeChannel(st.channel)}
 let c=st.sb.channel("couple-live-"+st.user.id);
 for(const name of ["love_wallets","love_wallet_events","love_dishes","love_tasks","love_orders","love_task_claims"])
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
document.addEventListener("submit",async e=>{
 if(!["loginForm","dishForm","taskForm"].includes(e.target?.id))return;
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
document.addEventListener("click",async e=>{
 const btn=e.target.closest("[data-action]");if(!btn)return;
 const type=btn.dataset.action,id=btn.dataset.id;
 if(type==="restart"){init();return}
 if(type==="nav"){st.tab=btn.dataset.tab;render();window.scrollTo(0,0);return}
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
   window.clearInterval(refreshTimer);st.channel=null;st.tab="home";loginView();return;
 }
 const rpc=async(name,args)=>{const {data,error}=await st.sb.rpc(name,args||{});if(error)throw error;return data};
 if(type==="sign"){await operation(async()=>{const r=await rpc("love_daily_checkin");notice(r.awarded?"签到成功！+50积分":"今天已经签到过啦")});return}
 if(type==="buy"){
   const dish=st.dishes.find(x=>x.id===id);if(!dish)return;
   if(dish.price>balance()){notice("积分还差 "+(dish.price-balance())+" ◎，先去做心动任务吧！",true);return}
   const note=window.prompt("给老板的备注（例如：不要香菜，可留空）","");if(note===null)return;
   if(!window.confirm("花费 "+dish.price+" 积分点「"+dish.name+"」？"))return;
   await operation(async()=>{await rpc("love_place_order",{p_dish_id:id,p_note:note});st.tab="orders";notice("下单成功！老板快接单 ♡")});return;
 }
 if(type==="claim"){
   const t=st.tasks.find(x=>x.id===id);if(!t)return;
   const hint=t.invite_only?"只要自愿提出邀请就能申请；是否进一步亲密，由双方自由决定，不要求证明。":"确认已经完成「"+t.name+"」了吗？";
   if(!window.confirm(hint))return;
   await operation(async()=>{await rpc("love_claim_task",{p_task_id:id});notice("申请已提交，等待老板审核")});return;
 }
 if(type==="approve"||type==="reject"){
   if(!window.confirm(type==="approve"?"批准后奖励会立即发到女朋友的积分账户，确定吗？":"确定驳回这项任务吗？"))return;
   await operation(async()=>{await rpc("love_review_claim",{p_claim_id:id,p_approve:type==="approve"});notice(type==="approve"?"审核通过！积分已发放":"已驳回申请")});return;
 }
 if(type==="advance"){await operation(async()=>{await rpc("love_advance_order",{p_order_id:id});notice("订单状态已更新")});return}
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