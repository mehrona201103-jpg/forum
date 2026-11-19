const BUILD='__V__';
const $=s=>document.querySelector(s),app=$('#app');let ME=null,META={};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=t=>t?new Date(t).toLocaleString('ru',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const ago=t=>{const s=(Date.now()-t)/1000;return s<60?'Только что':s<3600?Math.floor(s/60)+' мин. назад':s<86400?Math.floor(s/3600)+' ч. назад':fmt(t)};
async function api(u,m='GET',b){
 let r;try{r=await fetch('/api'+u,{method:m,headers:b?{'Content-Type':'application/json'}:{},body:b?JSON.stringify(b):undefined,credentials:'same-origin'})}catch(x){const e=new Error('Нет соединения с сервером');e.status=0;throw e}
 const j=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(j.error||'Ошибка');e.status=r.status;throw e}return j}
const toast=t=>{const e=$('#toast');e.textContent=t;e.style.display='block';clearTimeout(e._t);e._t=setTimeout(()=>e.style.display='none',2600)};
const ICON={chat:'<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="3.5"/><path d="M8 18l-2 3 5-3M8 9.5h8M8 13h5" stroke-linecap="round"/></svg>',
crown:'<svg width="26" height="26" viewBox="0 0 24 24" fill="#58a6ff"><path d="M3 18l-1-11 5 4 5-7 5 7 5-4-1 11z"/></svg>',
tg:'<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M21 3L3 10.5l6 2.5 2 6 3-4 5 3z"/></svg>',
ds:'<svg width="30" height="30" viewBox="0 0 24 24" fill="#5865f2"><path d="M5 6c2-1.5 4-2 4-2l.5 1h5L15 4s2 .5 4 2c2 3.5 2.5 8 2 11-2 1.5-4 2-4 2l-1-1.5c.8-.2 1.5-.6 2-1-3 1.4-8 1.400-11 0 .5.4 1.200.8 2 1L8 19s-2-.5-4-2c-.5-3 0-7.500 1-11z"/></svg>'};
const COL=['#2d8bff','#8a5cff','#ff6b6b','#20b486','#e0a030','#d6489c'];
function av(u,c=''){const n=u.name||'?';if(u.avatar)return`<span class="av ${c}" style="background-image:url('${esc(u.avatar)}')"></span>`;return`<span class="av ${c}" style="background:${COL[(n.charCodeAt(0)+n.length)%6]}">${esc(n[0].toUpperCase())}</span>`}
function body(s){let t=esc(s).replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener nofollow">$1</a>');
 t=t.split('\n').map(l=>l.startsWith('&gt; ')?`<blockquote>${l.slice(5)}</blockquote>`:l+'<br>').join('').replace(/<\/blockquote><br>/g,'</blockquote>');return t}
const pager=(p,n,base)=>n<2?'':`<div class="pages">${Array.from({length:n},(_,i)=>i+1).map(i=>i===p?`<b>${i}</b>`:`<a href="${base}/${i}">${i}</a>`).join('')}</div>`;
const crumbs=a=>`<div class="crumbs"><a href="#/">Главная</a>${a.map(x=>`<span>›</span>${x[1]?`<a href="${x[1]}">${esc(x[0])}</a>`:esc(x[0])}`).join('')}</div>`;
const editIco='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>';

/* ===== Галочка как у Instagram: круг с «шипами» + белая птичка. Рисуется один раз (sprite), цвет — через color ===== */
(function(){
 const R=9.75,a=1.45,pts=[]; // 8 округлых «шипов» (как scallop у Instagram): |cos(4t)| даёт круглые выступы и острые впадины
 for(let i=0;i<=200;i++){const t=i/200*Math.PI*2,r=R+a*Math.abs(Math.cos(4*t));pts.push((12+r*Math.cos(t)).toFixed(2)+' '+(12+r*Math.sin(t)).toFixed(2))}
 document.body.insertAdjacentHTML('afterbegin',`<svg width="0" height="0" style="position:absolute" aria-hidden="true"><symbol id="vfb" viewBox="0 0 24 24"><path d="M${pts.join('L')}Z" fill="currentColor"/><path d="M7.2 12.4l3.2 3.2 6.4-6.6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></symbol></svg>`);
})();

/* ===== Окно «Доступно обновление» ===== */
let updShown=false;
async function checkUpdate(){
 if(updShown)return;
 try{const r=await fetch('/api/version',{cache:'no-store'});const j=await r.json();if(j.v&&j.v!==BUILD)showUpd(j)}catch(e){}
}
function showUpd(j){
 updShown=true;const u=$('#upd');
 u.innerHTML=`<div class="updc"><div class="updt"><b>🔄 Доступно обновление форума</b><small>${j.notes&&j.notes.length?esc(j.notes.slice(0,3).join(' · ')):'Новые функции и улучшения'}. Аккаунты и данные сохранятся.</small></div><div class="upda"><button class="btn sm" id="updgo">Обновить</button><button class="btn sm g" id="updx" aria-label="Позже">✕</button></div></div>`;
 u.hidden=false;
 $('#updgo').onclick=async e=>{const b=e.currentTarget;b.disabled=true;b.textContent='Обновляем…';
  try{if(window.caches){for(const k of await caches.keys())await caches.delete(k)}}catch(x){}
  location.reload()};
 $('#updx').onclick=()=>{u.hidden=true;setTimeout(()=>{updShown=false},5*60*1000)};
}
setInterval(checkUpdate,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkUpdate()});
addEventListener('focus',checkUpdate);setTimeout(checkUpdate,4000);

async function loadMe(){const j=await api('/me');ME=j.user;META=j;renderTop()}
function renderTop(){
 $('#topr').innerHTML=ME?`<a class="ib" href="#/notifs" title="Уведомления"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M6 17V11a6 6 0 1112 0v6l2 2H4zM10 21h4"/></svg>${META.unread?`<span class="badge">${META.unread}</span>`:''}</a><a href="#/user/${ME.id}">${av(ME)}</a>`:`<a class="btn sm g" href="#/login">Вход</a><a class="btn sm" href="#/register">Регистрация</a>`;
 const h=location.hash||'#/';
 const L=(href,t)=>`<a href="${href}" class="${h===href||(href!=='#/'&&h.startsWith(href))?'on':''}">${t}</a>`;
 $('#nav').innerHTML=L('#/','Форумы')+L('#/new','Что нового?')+L('#/chat','💬 Чат')+L('#/users','Пользователи')+L('#/rules','Правила форума')+`<a href="${ME?'#/post/'+(META.reportForum||''):'#/login'}">Подать жалобу</a>`+(ME&&ME.panel?L('#/admin',ME.role==='admin'?'Админ-панель':'Панель модератора'):'')+(ME?`<a href="#" id="out">Выйти</a>`:'')+`<form id="sf"><input placeholder="Поиск..." id="q" enterkeyhint="search"></form>`;
 $('#nav').classList.remove('open');$('#burger').setAttribute('aria-expanded','false');
 $('#sf').onsubmit=e=>{e.preventDefault();location.hash='#/search/'+encodeURIComponent($('#q').value)};
 const o=$('#out');if(o)o.onclick=async e=>{e.preventDefault();await api('/logout','POST');ME=null;location.hash='#/';await loadMe();route()};
}
$('#burger').onclick=()=>{const o=$('#nav').classList.toggle('open');$('#burger').setAttribute('aria-expanded',o?'true':'false')};

async function home(){
 const d=await api('/index');
 const sec=s=>`<div class="box"><h3>${ICON[s.icon]||ICON.chat}${esc(s.title)}</h3>${d.forums.filter(f=>f.section_id===s.id).map(f=>f.link?`<div class="row"><span class="ico">${ICON[f.icon]}</span><div class="m"><a class="t" href="${esc(f.link)}" target="_blank" rel="noopener">${esc(f.title)}</a></div></div>`:`<div class="row"><span class="ico">${ICON.chat}</span><div class="m"><a class="t" href="#/forum/${f.id}">${esc(f.title)}</a><small>${esc(f.descr)}</small>${f.kids.length?`<span class="tg" onclick="this.nextElementSibling.classList.toggle('open')">Подфорумы ⌄</span><div class="subs">${f.kids.map(k=>`<a href="#/forum/${k.id}">${esc(k.title)}</a>`).join('')}</div>`:''}<small class="mob">Темы: ${f.topics} Сообщения: ${f.posts}</small></div><div class="c">Темы<b>${f.topics}</b>Сообщения<b>${f.posts}</b></div><div class="l">${f.last?`<a href="#/topic/${f.last.id}">${esc(f.last.title)}</a>${ago(f.last.last_post)} · ${esc(f.last.name)}`:'Нет'}</div></div>`).join('')}</div>`;
 const pl=u=>`<div class="pl">${av(u)}<div>${uname(u)}<small>${pfx(u)}</small></div></div>`;
 app.innerHTML=crumbs([['Форумы']])+`<div class="head"><h1>WAIP RUSSIA — Форум</h1>${ME?`<a class="btn" href="#/post/">Создать тему...</a>`:''}</div><div class="grid"><div>${d.sections.map(sec).join('')}</div><div class="side">
 <a class="btn" style="width:100%;margin-bottom:14px" href="#/chat">💬 Общий чат</a>
 <div class="box"><h3>Команда проекта онлайн</h3>${d.team.map(pl).join('')||'<div class="stat">Никого нет</div>'}</div>
 <div class="box"><h3>Пользователи онлайн</h3>${d.online.map(pl).join('')}<div class="stat">Всего: ${d.online.length+d.guests} (пользователей: ${d.online.length}, гостей: ${d.guests})</div></div>
 <div class="box"><h3>Последние сообщения</h3>${d.recent.map(r=>`<div class="pl">${av({name:r.name,avatar:r.avatar})}<div><a href="#/topic/${r.tid}">${esc(r.body)}</a><small>От: ${esc(r.name)} · ${ago(r.created)}</small></div></div>`).join('')||'<div class="stat">Пока пусто</div>'}</div>
 <div class="box"><h3>🏆 Топ активных</h3>${d.top.map((u,i)=>`<div class="pl"><b>${i+1}</b>${av(u)}<div>${uname(u)}<small>${u.rank} · ${u.pts} баллов</small></div></div>`).join('')}</div>
 <div class="box"><h3>Статистика форума</h3><div class="stat">Темы:<b>${d.stats.topics}</b></div><div class="stat">Сообщения:<b>${d.stats.posts}</b></div><div class="stat">Пользователи:<b>${d.stats.users}</b></div>${d.stats.newest?`<div class="stat">Новый пользователь:<a href="#/user/${d.stats.newest.id}">${esc(d.stats.newest.name)}</a></div>`:''}</div></div></div>`;
 const b=app.querySelector('.head .btn');if(b)b.onclick=e=>{e.preventDefault();pickForum(d)};
}
function pickForum(d){const opts=d.forums.filter(f=>!f.link&&(!f.staff_only||can('staff_forum')||can('panel_topic'))).map(f=>`<option value="${f.id}">${esc(f.title)}</option>`).join('');
 if($('#pk'))return;
 app.insertAdjacentHTML('afterbegin',`<div class="box pad" id="pk"><h2>Выберите раздел</h2><select id="ps">${opts}</select><p><button class="btn" id="pg">Далее</button></p></div>`);$('#pg').onclick=()=>location.hash='#/post/'+$('#ps').value}

function auth(reg){
 app.innerHTML=`<div class="box pad form"><h1>${reg?'Регистрация':'Вход'}</h1><label>Ник</label><input id="un" autocomplete="username" autocapitalize="none"><label>Пароль</label><input id="pw" type="password" autocomplete="${reg?'new-password':'current-password'}"><p><button class="btn" id="go">${reg?'Создать аккаунт':'Войти'}</button></p><div class="err" id="ae"></div><p style="color:var(--mu)">${reg?'Уже есть аккаунт? <a href="#/login">Войти</a>':'Нет аккаунта? <a href="#/register">Регистрация</a>'}</p></div>`;
 const go=async()=>{try{await api(reg?'/register':'/login','POST',{name:$('#un').value,pass:$('#pw').value});await loadMe();location.hash='#/'}catch(e){$('#ae').textContent=e.message}};$('#go').onclick=go;$('#pw').onkeydown=e=>e.key==='Enter'&&go();
}
async function users(){
 const l=await api('/users');
 app.innerHTML=crumbs([['Пользователи']])+`<div class="box"><h3>Пользователи (${l.length})</h3>${l.map(u=>`<div class="pl">${av(u)}<div>${uname(u)}<small>${pfx(u)} · с ${fmt(u.created)}</small></div></div>`).join('')}</div>`;
}
async function search(q){const l=await api('/search?q='+encodeURIComponent(q));
 app.innerHTML=crumbs([['Поиск']])+`<h1>Поиск: ${esc(q)}</h1><div class="box" style="margin-top:12px">${l.map(t=>`<div class="row"><div class="m"><a class="t" href="#/topic/${t.id}">${esc(t.title)}</a><small>${esc(t.ftitle)} · ${esc(t.name)} · ${ago(t.last_post)}</small></div></div>`).join('')||'<div class="pad" style="color:var(--mu)">Ничего не найдено. Попробуйте другой запрос.</div>'}</div>`}
async function newest(){const d=await api('/index');
 app.innerHTML=crumbs([['Что нового?']])+`<h1>Что нового?</h1><div class="box" style="margin-top:12px"><h3>Последние сообщения</h3>${d.recent.map(r=>`<div class="pl">${av({name:r.name,avatar:r.avatar})}<div><a href="#/topic/${r.tid}">${esc(r.title)}</a><small>${esc(r.name)}: ${esc(r.body)} · ${ago(r.created)}</small></div></div>`).join('')||'<div class="pad">Пока пусто</div>'}</div>`}
async function notifs(){if(!ME)return location.hash='#/login';const l=await api('/notifs');await api('/notifs/read','POST');META.unread=0;renderTop();
 app.innerHTML=crumbs([['Уведомления']])+`<h1>Уведомления</h1><div class="box" style="margin-top:12px">${l.map(n=>`<div class="row"><div class="m"><a class="t" href="${esc(n.link)}">${esc(n.text)}</a><small>${ago(n.created)}</small></div></div>`).join('')||'<div class="pad" style="color:var(--mu)">Уведомлений нет</div>'}</div>`}
function rules(){app.innerHTML=crumbs([['Правила форума']])+`<h1>Правила форума</h1><div class="box pad body" style="margin-top:12px">${body(META.rules)}</div>`}

let fitFn=null;
function leaveChat(){clearInterval(window.chatTimer);document.documentElement.classList.remove('chatmode');if(fitFn){removeEventListener('resize',fitFn);if(window.visualViewport)visualViewport.removeEventListener('resize',fitFn);fitFn=null}}
async function route(){
 const h=(location.hash||'#/').slice(1),p=h.split('/').filter(Boolean);renderTop();window.scrollTo(0,0);leaveChat();
 try{const a=p[0];
  if(!a)await home();else if(a==='forum')await forum(p[1],p[2]);else if(a==='topic')await topic(p[1],p[2]);else if(a==='post')await newPost(p[1]);
  else if(a==='login')auth(0);else if(a==='register')auth(1);else if(a==='user')await user(p[1]);else if(a==='users')await users();
  else if(a==='search')await search(decodeURIComponent(p[1]||''));else if(a==='new')await newest();else if(a==='notifs')await notifs();
  else if(a==='rules')rules();else if(a==='admin'||a==='panel')await admin();else if(a==='chat')await chat();else await home();
 }catch(e){app.innerHTML=`<div class="box pad form"><h2>Ошибка</h2><p>${esc(e.message)}</p><a class="btn" href="#/">На главную</a></div>`}
}
addEventListener('hashchange',route);loadMe().then(route).catch(()=>route());

const ST={review:['На рассмотрении','#e0a030'],approved:['Одобрено','#20b486'],rejected:['Отказано','#e5484d'],checked:['Проверено','#2d8bff']};
const ncol=u=>u.color||(u.role==='admin'?'#ff3b5c':u.role==='mod'?'#ffb84a':'#e8f0ff');
const bcol=u=>u.bcolor||u.color||(u.role==='admin'?'#ff3b5c':'#2d8bff');
const CHK=c=>`<svg class="vf" viewBox="0 0 24 24" style="color:${esc(c)}" role="img" aria-label="Подтверждён"><use href="#vfb"/></svg>`;
const uname=u=>`<a class="nm" href="#/user/${u.id}" style="color:${esc(ncol(u))}">${esc(u.name)}</a>${u.verified?CHK(bcol(u)):''}`;
const pfx=u=>u.prefix?`<span class="pfx" style="background:${esc(u.pcolor)}">${esc(u.prefix)}</span>`:'';
const stb=s=>s&&ST[s]?`<span class="st" style="background:${ST[s][1]}">${ST[s][0]}</span>`:'';
const tpf=t=>t.ptext?`<span class="pfx" style="background:${esc(t.pcol)}">${esc(t.ptext)}</span>`:'';
const can=p=>!!ME&&!ME.banned&&(ME.role==='admin'||(ME.role==='mod'&&(ME.perms||[]).includes(p)));
const A=p=>({id:p.user_id,name:p.name,role:p.role,color:p.color,verified:p.verified,bcolor:p.bcolor,prefix:p.prefix,pcolor:p.pcolor,avatar:p.avatar});
const EMO=['👍','❤️','🔥','😂','😮','😢'];
const PL={pin:'Закреплять темы',lock:'Закрывать/открывать темы',move:'Переносить темы',delete_topic:'Удалять темы',delete_post:'Удалять сообщения',edit_post:'Править чужие сообщения',ban:'Банить игроков',status:'Менять статус заявок',topic_prefix:'Ставить префиксы темам',chat:'Модерировать чат',staff_forum:'Писать в закрытых разделах'};
const PP={panel_topic:'Создавать темы из панели (и в закрытых разделах)',panel_forums:'Разделы и форумы (создать/удалить)',panel_prefixes:'Префиксы тем',panel_rules:'Правила форума',panel_users:'Галочки, цвета и префиксы игроков'};

async function forum(id,page=1){
 const d=await api(`/forum/${id}?page=${page}`),f=d.forum;
 app.innerHTML=crumbs([['Форумы','#/'],...(d.parent?[[d.parent.title,'#/forum/'+d.parent.id]]:[]),[f.title]])+`<div class="head"><h1>${esc(f.title)}</h1>${d.canPost?`<a class="btn" href="#/post/${f.id}">Создать тему...</a>`:(!ME?'<a class="btn g" href="#/login">Войдите, чтобы писать</a>':'')}</div>`+
 (d.kids.length?`<div class="box"><h3>Подразделы</h3>${d.kids.map(k=>`<div class="row"><span class="ico">${ICON.chat}</span><div class="m"><a class="t" href="#/forum/${k.id}">${esc(k.title)}</a><small>${esc(k.descr)}</small></div></div>`).join('')}</div>`:'')+
 `<div class="box"><h3>Темы</h3>${d.topics.map(t=>`<div class="row"><span class="ico">${ICON.chat}</span><div class="m"><a class="t" href="#/topic/${t.id}">${t.pinned?'📌 ':''}${t.locked?'🔒 ':''}${tpf(t)}${esc(t.title)}</a><small>${stb(t.status)}${esc(t.name)} · ${fmt(t.created)}<span class="mob"> · ответов: ${t.replies}</span></small></div><div class="c">Ответы<b>${t.replies}</b>Просмотры<b>${t.views}</b></div><div class="l">${ago(t.last_post)}<br>${esc(t.last_name)}</div></div>`).join('')||'<div class="pad" style="color:var(--mu)">Тем пока нет. Создайте первую!</div>'}</div>`+pager(d.page,d.pages,'#/forum/'+id);
}
async function topic(id,page=1){
 const d=await api(`/topic/${id}?page=${page}`),t=d.topic;
 const sel=(a,opts)=>`<select data-s="${a}" style="width:auto;padding:5px 8px">${opts}</select>`;
 const mods=ME&&ME.role!=='user'?`<div class="acts" style="margin:0">${can('pin')?`<button class="btn sm g" data-m="pin">${t.pinned?'Открепить':'Закрепить'}</button>`:''}${can('lock')?`<button class="btn sm g" data-m="lock">${t.locked?'Открыть':'Закрыть'}</button>`:''}${can('move')?'<button class="btn sm g" data-m="move">Переместить</button>':''}${can('delete_topic')?'<button class="btn sm r" data-m="delete">Удалить тему</button>':''}
 ${can('status')?sel('status','<option value="">Статус: —</option>'+Object.keys(ST).map(k=>`<option value="${k}"${t.status===k?' selected':''}>${ST[k][0]}</option>`).join('')):''}
 ${can('topic_prefix')?sel('prefix','<option value="">Префикс: —</option>'+d.prefixes.map(p=>`<option value="${p.id}"${t.prefix_id===p.id?' selected':''}>${esc(p.text)}</option>`).join('')):''}</div>`:'';
 app.innerHTML=crumbs([['Форумы','#/'],[d.forum.title,'#/forum/'+d.forum.id],[t.title]])+`<div class="head"><h1>${t.pinned?'📌 ':''}${t.locked?'🔒 ':''}${tpf(t)}${esc(t.title)}</h1>${mods}</div>
 ${t.status?`<div class="chk">${stb(t.status)}${d.checker?` Проверил: ${uname(d.checker)} ${pfx(d.checker)} <small style="color:var(--mu)">· ${fmt(t.status_at)}</small>`:' Ожидает проверки администрацией'}</div>`:''}
 <div class="box">${d.posts.map(p=>{const a=A(p);return`<div class="post" id="p${p.id}"><div class="au">${av(a)}<div>${uname(a)}<br>${pfx(a)}${p.banned?'<span class="tag" style="background:#5b1426">Заблокирован</span><br>':''}Сообщений: ${p.ucount}</div></div><div class="pb"><div class="pm"><span>${fmt(p.created)}${p.edited?' · изменено':''}</span><span>#${p.id}</span></div><div class="body" id="b${p.id}">${body(p.body)}</div><div class="acts">
 ${p.reactions.map(r=>`<button class="rx ${r.mine?'on':''}" ${ME?`data-rx="${p.id}|${r.emoji}"`:''}>${r.emoji} ${r.c}</button>`).join('')}
 ${ME?`<span class="rxp">${EMO.map(e=>`<button data-rx="${p.id}|${e}">${e}</button>`).join('')}</span><button class="btn sm g" data-q="${p.id}">Цитата</button>`:''}
 ${ME&&(ME.id===p.user_id||can('edit_post'))?`<button class="btn sm g" data-e="${p.id}">${editIco} Изменить</button>`:''}${ME&&(ME.id===p.user_id||can('delete_post')||(can('delete_topic')&&p.id===d.posts[0].id))?`<button class="btn sm r" data-d="${p.id}">Удалить</button>`:''}</div></div></div>`}).join('')}</div>`+pager(d.page,d.pages,'#/topic/'+id)+
 (ME?(t.locked&&!can('lock')?'<div class="box pad">Тема закрыта</div>':`<div class="box pad"><h2>Ответить</h2><textarea id="rb" placeholder="Ваше сообщение..."></textarea><p><button class="btn" id="rs">Отправить</button> <span class="err" id="re"></span></p></div>`):`<div class="box pad">Чтобы отвечать, <a href="#/login">войдите</a> или <a href="#/register">зарегистрируйтесь</a>.</div>`);
 const raw={};d.posts.forEach(p=>raw[p.id]=p);const go=async f=>{try{await f();route()}catch(e){toast(e.message)}};
 app.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{const a=b.dataset.m;if(a==='delete'&&!confirm('Удалить тему?'))return;let fid;if(a==='move'){fid=prompt('ID раздела (виден в адресе #/forum/ID):');if(!fid)return}
  go(async()=>{await api(`/topic/${id}/mod`,'POST',{action:a,forum_id:fid});if(a==='delete'){location.hash='#/';throw new Error('Тема удалена')}})});
 app.querySelectorAll('[data-s]').forEach(s=>s.onchange=()=>go(()=>api(`/topic/${id}/mod`,'POST',s.dataset.s==='status'?{action:'status',status:s.value}:{action:'prefix',prefix_id:s.value})));
 app.querySelectorAll('[data-rx]').forEach(b=>b.onclick=()=>{const[p,e]=b.dataset.rx.split('|');go(()=>api('/like/'+p,'POST',{emoji:e}))});
 app.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{const p=raw[b.dataset.q],r=$('#rb');if(!r)return;r.value+=(r.value?'\n':'')+'> '+p.name+': '+p.body.split('\n')[0].slice(0,200)+'\n\n';r.focus();r.scrollIntoView({block:'center'})});
 app.querySelectorAll('[data-d]').forEach(b=>b.onclick=async()=>{if(!confirm('Удалить сообщение?'))return;try{const r=await api('/post/'+b.dataset.d,'DELETE');if(r.topicDeleted)location.hash='#/';else route()}catch(e){toast(e.message)}});
 app.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>{const i=b.dataset.e,el=$('#b'+i);el.innerHTML=`<textarea id="ed">${esc(raw[i].body)}</textarea><p><button class="btn sm" id="es">Сохранить</button> <button class="btn sm g" id="ec">Отмена</button></p>`;$('#ec').onclick=()=>el.innerHTML=body(raw[i].body);$('#es').onclick=()=>go(()=>api('/post/'+i,'PUT',{body:$('#ed').value}))});
 const rs=$('#rs');if(rs)rs.onclick=async()=>{try{const r=await api('/post','POST',{topic_id:id,body:$('#rb').value});location.hash=`#/topic/${id}/${r.page}`;route()}catch(e){$('#re').textContent=e.message}};
}
async function newPost(fid){
 if(!ME)return location.hash='#/login';
 const pf=(await api('/prefixes')).filter(p=>!p.staff_only||can('topic_prefix')||can('panel_topic'));
 app.innerHTML=crumbs([['Форумы','#/'],['Новая тема']])+`<div class="box pad form" style="max-width:800px"><h1>Создать тему</h1><label>Префикс темы</label><select id="tp"><option value="">Без префикса</option>${pf.map(p=>`<option value="${p.id}">${esc(p.text)}</option>`).join('')}</select><label>Заголовок</label><input id="tt" maxlength="120"><label>Сообщение</label><textarea id="tb" style="min-height:240px"></textarea><p><button class="btn" id="ts">Опубликовать</button></p><div class="err" id="te"></div></div>`;
 if(!fid){const d=await api('/index');app.querySelector('h1').insertAdjacentHTML('afterend',`<label>Раздел</label><select id="tf">${d.forums.filter(f=>!f.link&&(!f.staff_only||can('staff_forum')||can('panel_topic'))).map(f=>`<option value="${f.id}">${esc(f.title)}</option>`).join('')}</select>`)}
 $('#ts').onclick=async()=>{try{const r=await api('/topic','POST',{forum_id:+(fid||$('#tf').value),prefix_id:$('#tp').value,title:$('#tt').value,body:$('#tb').value});location.hash='#/topic/'+r.id}catch(e){$('#te').textContent=e.message}};
}
async function user(id){
 const d=await api('/user/'+id),u=d.user,me=ME&&ME.id===u.id;
 app.innerHTML=crumbs([['Пользователи','#/users'],[u.name]])+`<div class="box" style="border-color:${esc(ncol(u))}66"><div class="pad" style="display:flex;gap:18px;flex-wrap:wrap">${av(u,'l')}<div style="flex:1;min-width:200px"><h1 style="font-size:26px">${uname(u)}</h1><div style="margin:6px 0">${pfx(u)}<span class="tag">${d.rank}</span>${u.banned?'<span class="tag" style="background:#5b1426">Заблокирован</span>':''}</div><div style="color:var(--mu);font-size:13px">Регистрация: <b style="color:#fff">${fmt(u.created)}</b><br>Активность: <b style="color:#fff">${ago(u.last_seen)}</b></div><p style="overflow-wrap:anywhere">${esc(u.about)||''}</p>${can('ban')&&u.role==='user'?`<button class="btn sm ${u.banned?'g':'r'}" id="bn">${u.banned?'Разбанить':'Забанить'}</button>`:''}</div></div><div class="stats3"><span>Сообщения<b>${d.posts}</b></span><span>Реакции<b>${d.likes}</b></span><span>Баллы<b>${d.points}</b></span><span>Темы<b>${d.topics}</b></span></div></div>
 ${me?`<div class="box pad"><h2>Редактировать профиль</h2><label>Ссылка на аватар (https://...)</label><input id="pa" value="${esc(u.avatar||'')}"><label>О себе</label><textarea id="pab" style="min-height:90px">${esc(u.about)}</textarea><p><button class="btn" id="ps">Сохранить</button></p><h2>Смена пароля</h2><input id="op" type="password" placeholder="Старый пароль" autocomplete="current-password"><br><br><input id="np" type="password" placeholder="Новый пароль" autocomplete="new-password"><p><button class="btn g" id="pp">Сменить пароль</button></p></div>`:''}
 <div class="box"><h3>Последние темы</h3>${d.recent.map(t=>`<div class="row"><div class="m"><a class="t" href="#/topic/${t.id}">${esc(t.title)}</a><small>${fmt(t.created)}</small></div></div>`).join('')||'<div class="pad" style="color:var(--mu)">Нет тем</div>'}</div>`;
 const bn=$('#bn');if(bn)bn.onclick=async()=>{try{await api('/ban/'+u.id,'PUT',{banned:!u.banned});route()}catch(e){toast(e.message)}};
 if(me){$('#ps').onclick=async()=>{await api('/me','PUT',{avatar:$('#pa').value,about:$('#pab').value});toast('Сохранено');await loadMe();route()};$('#pp').onclick=async()=>{try{await api('/password','POST',{old:$('#op').value,pass:$('#np').value});toast('Пароль изменён')}catch(e){toast(e.message)}}}
}

/* ===== ЧАТ: окно ровно по размеру экрана, поле ввода всегда внизу и на виду, ошибки видны прямо над полем ===== */
async function chat(){
 const ok=ME&&!ME.banned;
 app.innerHTML=`<div class="chathead"><h1>💬 Общий чат</h1><a class="btn sm g" href="#/">← К форуму</a></div><div class="box chatwrap" id="cw"><div id="cl" class="chatlog"></div>${ok?`<div class="cerr" id="cerr"></div><form class="cin" id="cf" autocomplete="off"><input id="ci" maxlength="300" placeholder="Напишите сообщение..." enterkeyhint="send" autocomplete="off" autocapitalize="sentences"><button class="btn" id="cs" type="submit">Отправить</button></form>`:`<div class="pad cneed">${ME?'Ваш аккаунт заблокирован.':'Чтобы писать в чат, <a href="#/login">войдите</a> или <a href="#/register">зарегистрируйтесь</a>.'}</div>`}</div>`;
 document.documentElement.classList.add('chatmode');
 fitFn=()=>{const w=$('#cw');if(!w)return;const vv=window.visualViewport,h=vv?vv.height:innerHeight;window.scrollTo(0,0);const top=w.getBoundingClientRect().top;w.style.height=Math.max(240,h-top-8)+'px';const cl=$('#cl');if(cl&&cl._stick)cl.scrollTop=cl.scrollHeight};
 addEventListener('resize',fitFn);if(window.visualViewport)visualViewport.addEventListener('resize',fitFn);fitFn();
 let last=0;const cl=$('#cl');cl._stick=true;
 cl.addEventListener('scroll',()=>{cl._stick=cl.scrollHeight-cl.scrollTop-cl.clientHeight<60},{passive:true});
 const row=r=>`<div class="cm" id="c${r.id}">${av(r.user)}<div><div>${uname(r.user)} ${pfx(r.user)}<small>${fmt(r.created)}</small>${ME&&(ME.id===r.user.id||can('chat'))?`<a href="#" class="del" data-cd="${r.id}">удалить</a>`:''}</div><div class="tx">${esc(r.body)}</div></div></div>`;
 let busy=false;
 const poll=async()=>{if(busy||document.hidden||!$('#cl'))return;busy=true;try{const rows=await api('/chat?after='+last);if(!rows.length)return;
  const first=!last;rows.forEach(r=>{last=Math.max(last,r.id);if(!$('#c'+r.id))cl.insertAdjacentHTML('beforeend',row(r))});
  if(first||cl._stick)cl.scrollTop=cl.scrollHeight}catch(e){}finally{busy=false}};
 cl.onclick=async e=>{const a=e.target.closest('[data-cd]');if(!a)return;e.preventDefault();try{await api('/chat/'+a.dataset.cd,'DELETE');const el=$('#c'+a.dataset.cd);if(el)el.remove()}catch(x){toast(x.message)}};
 const f=$('#cf');
 if(f){const ci=$('#ci'),cerr=$('#cerr');
  $('#cs').onmousedown=e=>e.preventDefault(); // чтобы клавиатура на телефоне не закрывалась
  f.onsubmit=async e=>{e.preventDefault();const text=ci.value.trim();if(!text)return;cerr.textContent='';const btn=$('#cs');btn.disabled=true;
   try{await api('/chat','POST',{body:text});ci.value='';cl._stick=true;await poll()}
   catch(x){cerr.innerHTML=esc(x.message)+(x.status===401?' · <a href="#/login">Войти</a>':'')}
   finally{btn.disabled=false;ci.focus()}};
 }
 await poll();clearInterval(window.chatTimer);window.chatTimer=setInterval(poll,2500);
 document.addEventListener('visibilitychange',function v(){if(!$('#cl')){document.removeEventListener('visibilitychange',v);return}if(!document.hidden)poll()});
}

/* ===== ПАНЕЛЬ (админ — всё; модератор — только то, что разрешил главный админ) ===== */
async function admin(){
 if(!ME||!ME.panel){location.hash='#/';return}
 const isA=ME.role==='admin',q=window.__uq||'';
 const showTopic=can('panel_topic'),showForums=can('panel_forums'),showPfx=can('panel_prefixes'),showRules=can('panel_rules'),showUsers=can('panel_users')||isA;
 const [d,us,pf,stg]=await Promise.all([api('/index'),showUsers?api('/users?q='+encodeURIComponent(q)):[],api('/prefixes'),isA?api('/admin/storage'):null]);
 const secOpts=d.sections.map(s=>`<option value="${s.id}">${esc(s.title)}</option>`).join('');
 const allForums=[];d.forums.forEach(f=>{if(!f.link)allForums.push(f);});
 const topicBox=showTopic?`<div class="box pad"><h2>Создать тему</h2><p class="mini">Можно писать и в закрытых разделах.</p><label class="mini">Раздел</label><select id="ntf">${allForums.map(f=>`<option value="${f.id}">${esc(f.title)}${f.staff_only?' (закрытый)':''}</option>`).join('')}</select><br><br><select id="ntp"><option value="">Без префикса</option>${pf.map(p=>`<option value="${p.id}">${esc(p.text)}</option>`).join('')}</select><br><br><input id="ntt" placeholder="Заголовок" maxlength="120"><br><br><textarea id="ntb" placeholder="Текст темы..." style="min-height:160px"></textarea><p class="acts">${can('pin')?'<label class="mini"><input type="checkbox" id="ntpin" style="width:auto"> Закрепить</label>':''}${can('lock')?'<label class="mini"><input type="checkbox" id="ntlock" style="width:auto"> Закрыть для ответов</label>':''}</p><p><button class="btn" id="ntgo">Опубликовать тему</button> <span class="err" id="nte"></span></p></div>`:'';
 const forumsBox=showForums?`<div class="box pad"><h2>Разделы и форумы</h2>${d.sections.map(s=>`<p><b>${esc(s.title)}</b> <button class="btn sm r" data-ds="${s.id}">×</button></p>${d.forums.filter(f=>f.section_id===s.id).map(f=>`<div class="stat">${esc(f.title)} (ID ${f.id})${f.is_apps?' · заявки':''} <button class="btn sm r" data-df="${f.id}">Удалить</button></div>`).join('')}`).join('')}</div>
 <div class="box pad"><h2>Добавить раздел</h2><input id="st" placeholder="Название раздела"><p><button class="btn" id="sa">Добавить</button></p>
 <h2>Добавить форум</h2><select id="fs">${secOpts}</select><br><br><input id="ft" placeholder="Название"><br><br><input id="fd" placeholder="Описание"><br><br><input id="fl" placeholder="Внешняя ссылка (Telegram/Discord), если это ссылка"><br><br><input id="fp" placeholder="ID родительского форума (для подфорума)"><br><br><label class="mini"><input type="checkbox" id="fo" style="width:auto"> Только персонал создаёт темы</label><br><label class="mini"><input type="checkbox" id="fz" style="width:auto"> Раздел заявок (темы получают статус «На рассмотрении»)</label><p><button class="btn" id="fa">Добавить форум</button></p></div>`:'';
 const pfxBox=showPfx?`<div class="box pad"><h2>Префиксы тем</h2>${pf.map(p=>`<span class="pfx" style="background:${esc(p.color)}">${esc(p.text)}${p.staff_only?' 🔒':''}</span><button class="btn sm r" data-dp="${p.id}" style="padding:0 7px;margin-right:10px">×</button>`).join('')}<div class="ucard" style="border:0;padding:12px 0 0"><div class="in"><input type="text" id="pt" placeholder="Новый префикс"><input type="color" id="pc" value="#2d8bff"><label class="c"><input type="checkbox" id="ps"> только персонал</label><button class="btn sm" id="pa">Добавить</button></div></div></div>`:'';
 const rulesBox=showRules?`<div class="box pad"><h2>Правила форума</h2><textarea id="ru">${esc(META.rules)}</textarea><p><button class="btn" id="rs">Сохранить правила</button></p></div>`:'';
 const userCard=u=>{
  if(u.role==='admin')return`<div class="ucard">${uname(u)} ${pfx(u)} — главный администратор (единственный, изменить нельзя)</div>`;
  const permsHtml=isA&&u.role==='mod'?`<div class="pg"><h4>Модерация</h4>${Object.keys(PL).map(k=>`<label><input type="checkbox" data-p="${k}"${(u.perms||[]).includes(k)?' checked':''}> ${PL[k]}</label>`).join('')}<h4>Что можно делать в панели</h4>${Object.keys(PP).map(k=>`<label><input type="checkbox" data-p="${k}"${(u.perms||[]).includes(k)?' checked':''}> ${PP[k]}</label>`).join('')}</div><div class="in"><button class="btn sm g" data-pall="1">Выдать всё</button><button class="btn sm g" data-pall="0">Снять всё</button></div>`:'';
  return`<div class="ucard" data-u="${u.id}"><div>${av(u)} ${uname(u)} ${pfx(u)}${u.banned?'<span class="tag" style="background:#5b1426">бан</span>':''}</div>
  <div class="in">${isA?`<select data-f="role" style="width:auto;padding:6px"><option value="user"${u.role==='user'?' selected':''}>Пользователь</option><option value="mod"${u.role==='mod'?' selected':''}>Модератор</option></select>`:''}
  ${can('panel_users')||isA?`<input type="text" data-f="prefix" placeholder="Префикс ника" value="${esc(u.prefix||'')}"><label class="c">Префикс <input type="color" data-f="prefix_color" value="${esc(u.pcolor||'#2d8bff')}"></label>
  <label class="c">Ник <input type="color" data-f="color" value="${esc(u.color||'#e8f0ff')}"></label>
  <label class="c">Галочка <input type="color" data-f="badge_color" value="${esc(u.bcolor||u.color||'#2d8bff')}"></label>
  <button class="btn sm g" data-rc="${u.id}">Сбросить цвета</button>
  <label class="c"><input type="checkbox" data-f="verified"${u.verified?' checked':''}> Галочка ✔</label>`:''}
  ${(isA||(can('ban')&&u.role==='user'))?`<button class="btn sm ${u.banned?'g':'r'}" data-bn="${u.id}" data-v="${u.banned?0:1}">${u.banned?'Разбанить':'Бан'}</button>`:''}</div>${permsHtml}</div>`};
 const usersBox=showUsers?`<div class="box"><h3>${isA?'Пользователи, модераторы и доступы':'Игроки: галочки, цвета, префиксы'}</h3><div class="pad"><input id="uq" placeholder="Поиск по нику..." value="${esc(q)}"></div>${us.map(userCard).join('')}</div>`:'';
 const stgBox=isA&&stg?`<div class="box pad"><h2>Хранилище и резервные копии</h2>${stg.warn?`<div class="warn"><b>⚠ Хранилище не постоянное!</b><br>База лежит внутри контейнера (<code>${esc(stg.dir)}</code>) и будет стираться при каждом деплое. На Railway: сервис → Settings → Volumes → <b>Add Volume</b>, Mount Path: <code>/data</code>. После этого форум сам найдёт его — аккаунты перестанут пропадать. А пока обязательно скачайте копию ниже.</div>`:`<div class="okb">✔ Данные хранятся в постоянной папке <code>${esc(stg.dir)}</code>. Пользователей: <b>${stg.users}</b>. При обновлении форума аккаунты сохраняются.</div>`}
  <p class="mini">Версия форума: ${esc(stg.version)} · сборка ${esc(stg.build)}. Перед каждым обновлением форум сам делает страховочную копию, ещё копии делаются каждые 6 часов.</p>
  <div class="acts"><a class="btn" href="/api/admin/backup" download>⬇ Скачать копию базы</a><button class="btn g" id="bkn">Сделать копию сейчас</button><label class="btn g" style="cursor:pointer">⬆ Восстановить из файла<input type="file" id="bkf" accept=".db,application/octet-stream" hidden></label></div>
  <div style="margin-top:10px">${stg.backups.map(b=>`<div class="bk"><span>${esc(b.name)} · ${(b.size/1024).toFixed(0)} КБ</span><a class="btn sm g" href="/api/admin/backups/${encodeURIComponent(b.name)}" download>Скачать</a><button class="btn sm g" data-rb="${esc(b.name)}">Восстановить</button></div>`).join('')||'<div class="mini">Копий пока нет</div>'}</div></div>`:'';
 app.innerHTML=crumbs([[isA?'Админ-панель':'Панель модератора']])+`<h1>${isA?'Админ-панель':'Панель модератора'}</h1>${!isA?'<p class="mini">Здесь доступно только то, что вам разрешил главный администратор.</p>':''}<div style="height:12px"></div>`+stgBox+topicBox+forumsBox+pfxBox+rulesBox+usersBox;
 const go=async f=>{try{await f();admin()}catch(e){toast(e.message)}},put=(id,b)=>api('/admin/user/'+id,'PUT',b);
 const on=(s,fn)=>app.querySelectorAll(s).forEach(fn);
 on('[data-ds]',b=>b.onclick=()=>go(()=>api('/admin/section/'+b.dataset.ds,'DELETE')));
 on('[data-df]',b=>b.onclick=()=>confirm('Удалить форум со всеми темами?')&&go(()=>api('/admin/forum/'+b.dataset.df,'DELETE')));
 on('[data-dp]',b=>b.onclick=()=>go(()=>api('/admin/prefix/'+b.dataset.dp,'DELETE')));
 on('[data-bn]',b=>b.onclick=()=>go(()=>put(b.dataset.bn,{banned:+b.dataset.v})));
 on('[data-rc]',b=>b.onclick=()=>go(()=>put(b.dataset.rc,{color:'',prefix_color:'',badge_color:''})));
 on('[data-u] [data-f]',el=>el.onchange=()=>{const id=el.closest('[data-u]').dataset.u,k=el.dataset.f,v=el.type==='checkbox'?el.checked:el.value;
  const ch=k==='role'||k==='verified'||k==='prefix';put(id,{[k]:v}).then(()=>{toast('Сохранено');if(ch)admin()}).catch(e=>toast(e.message))});
 on('[data-u] [data-p]',el=>el.onchange=()=>{const c=el.closest('[data-u]');const arr=[...c.querySelectorAll('[data-p]')].filter(x=>x.checked).map(x=>x.dataset.p);put(c.dataset.u,{perms:arr}).then(()=>toast('Доступы сохранены')).catch(e=>toast(e.message))});
 on('[data-pall]',b=>b.onclick=()=>{const c=b.closest('[data-u]'),v=b.dataset.pall==='1';c.querySelectorAll('[data-p]').forEach(x=>x.checked=v);const arr=v?[...c.querySelectorAll('[data-p]')].map(x=>x.dataset.p):[];put(c.dataset.u,{perms:arr}).then(()=>toast('Доступы сохранены')).catch(e=>toast(e.message))});
 const $$=id=>document.getElementById(id);
 if($$('uq'))$$('uq').onchange=()=>{window.__uq=$$('uq').value;admin()};
 if($$('sa'))$$('sa').onclick=()=>go(()=>api('/admin/section','POST',{title:$$('st').value}));
 if($$('fa'))$$('fa').onclick=()=>go(()=>api('/admin/forum','POST',{section_id:$$('fs').value,title:$$('ft').value,descr:$$('fd').value,link:$$('fl').value,parent_id:$$('fp').value,staff_only:$$('fo').checked,is_apps:$$('fz').checked}));
 if($$('pa'))$$('pa').onclick=()=>go(()=>api('/admin/prefix','POST',{text:$$('pt').value,color:$$('pc').value,staff_only:$$('ps').checked}));
 if($$('rs'))$$('rs').onclick=async()=>{try{await api('/admin/rules','PUT',{rules:$$('ru').value});META.rules=$$('ru').value;toast('Сохранено')}catch(e){toast(e.message)}};
 if($$('ntgo'))$$('ntgo').onclick=async()=>{try{const r=await api('/topic','POST',{forum_id:+$$('ntf').value,prefix_id:$$('ntp').value,title:$$('ntt').value,body:$$('ntb').value,pinned:!!($$('ntpin')&&$$('ntpin').checked),locked:!!($$('ntlock')&&$$('ntlock').checked)});location.hash='#/topic/'+r.id}catch(e){$$('nte').textContent=e.message}};
 if($$('bkn'))$$('bkn').onclick=()=>go(async()=>{await api('/admin/backup-now','POST',{});toast('Копия создана')});
 on('[data-rb]',b=>b.onclick=()=>confirm('Заменить текущие данные форума этой копией? Перед этим будет сделана ещё одна страховочная копия.')&&go(async()=>{const r=await api('/admin/restore-server','POST',{name:b.dataset.rb});toast('Восстановлено · пользователей: '+(r.counts.users||0))}));
 if($$('bkf'))$$('bkf').onchange=async e=>{const f=e.target.files[0];if(!f)return;if(!confirm('Заменить текущие данные форума данными из файла «'+f.name+'»? Перед этим будет сделана страховочная копия.'))return;
  try{const r=await fetch('/api/admin/restore',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:f,credentials:'same-origin'});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Ошибка');toast('Восстановлено · пользователей: '+(j.counts.users||0));admin()}catch(x){toast(x.message)}};
}
