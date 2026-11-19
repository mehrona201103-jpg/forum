const $=s=>document.querySelector(s),app=$('#app');let ME=null,META={};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=t=>t?new Date(t).toLocaleString('ru',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const ago=t=>{const s=(Date.now()-t)/1000;return s<60?'Только что':s<3600?Math.floor(s/60)+' мин. назад':s<86400?Math.floor(s/3600)+' ч. назад':fmt(t)};
async function api(u,m='GET',b){const r=await fetch('/api'+u,{method:m,headers:b?{'Content-Type':'application/json'}:{},body:b?JSON.stringify(b):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Ошибка');return j}
const toast=t=>{const e=$('#toast');e.textContent=t;e.style.display='block';clearTimeout(e._t);e._t=setTimeout(()=>e.style.display='none',2600)};
const ICON={chat:'<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="3.5"/><path d="M8 18l-2 3 5-3M8 9.5h8M8 13h5" stroke-linecap="round"/></svg>',
crown:'<svg width="26" height="26" viewBox="0 0 24 24" fill="#58a6ff"><path d="M3 18l-1-11 5 4 5-7 5 7 5-4-1 11z"/></svg>',
tg:'<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M21 3L3 10.5l6 2.5 2 6 3-4 5 3z"/></svg>',
ds:'<svg width="30" height="30" viewBox="0 0 24 24" fill="#5865f2"><path d="M5 6c2-1.5 4-2 4-2l.5 1h5L15 4s2 .5 4 2c2 3.5 2.5 8 2 11-2 1.5-4 2-4 2l-1-1.5c.8-.2 1.5-.6 2-1-3 1.4-8 1.400-11 0 .5.4 1.200.8 2 1L8 19s-2-.5-4-2c-.5-3 0-7.500 1-11z"/></svg>'};
const COL=['#2d8bff','#8a5cff','#ff6b6b','#20b486','#e0a030','#d6489c'];
function av(u,c=''){const n=u.name||'?';if(u.avatar)return`<span class="av ${c}" style="background-image:url('${esc(u.avatar)}')"></span>`;return`<span class="av ${c}" style="background:${COL[(n.charCodeAt(0)+n.length)%6]}">${esc(n[0].toUpperCase())}</span>`}
const uname=u=>`<a class="role-${u.role}" href="#/user/${u.id}">${esc(u.name)}</a>`;
function body(s){let t=esc(s).replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener nofollow">$1</a>');
 t=t.split('\n').map(l=>l.startsWith('&gt; ')?`<blockquote>${l.slice(5)}</blockquote>`:l+'<br>').join('').replace(/<\/blockquote><br>/g,'</blockquote>');return t}
const pager=(p,n,base)=>n<2?'':`<div class="pages">${Array.from({length:n},(_,i)=>i+1).map(i=>i===p?`<b>${i}</b>`:`<a href="${base}/${i}">${i}</a>`).join('')}</div>`;
const crumbs=a=>`<div class="crumbs"><a href="#/">Главная</a>${a.map(x=>`<span>›</span>${x[1]?`<a href="${x[1]}">${esc(x[0])}</a>`:esc(x[0])}`).join('')}</div>`;
const editIco='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>';

async function loadMe(){const j=await api('/me');ME=j.user;META=j;renderTop()}
function renderTop(){
 $('#topr').innerHTML=ME?`<a class="ib" href="#/notifs" title="Уведомления"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M6 17V11a6 6 0 1112 0v6l2 2H4zM10 21h4"/></svg>${META.unread?`<span class="badge">${META.unread}</span>`:''}</a><a href="#/user/${ME.id}">${av(ME)}</a>`:`<a class="btn sm g" href="#/login">Вход</a><a class="btn sm" href="#/register">Регистрация</a>`;
 const h=location.hash||'#/';
 const L=(href,t)=>`<a href="${href}" class="${h===href||(href!=='#/'&&h.startsWith(href))?'on':''}">${t}</a>`;
 $('#nav').innerHTML=L('#/','Форумы')+L('#/new','Что нового?')+L('#/users','Пользователи')+L('#/rules','Правила форума')+`<a href="${ME?'#/post/'+(META.reportForum||''):'#/login'}">Подать жалобу</a>`+(ME&&ME.role==='admin'?L('#/admin','Админ-панель'):'')+(ME?`<a href="#" id="out">Выйти</a>`:'')+`<form id="sf"><input placeholder="Поиск..." id="q" style="padding:7px 12px;width:200px"></form>`;
 $('#nav').classList.remove('open');
 $('#sf').onsubmit=e=>{e.preventDefault();location.hash='#/search/'+encodeURIComponent($('#q').value)};
 const o=$('#out');if(o)o.onclick=async e=>{e.preventDefault();await api('/logout','POST');ME=null;location.hash='#/';await loadMe();route()};
}
$('#burger').onclick=()=>$('#nav').classList.toggle('open');

async function home(){
 const d=await api('/index');
 const sec=s=>`<div class="box"><h3>${ICON[s.icon]||ICON.chat}${esc(s.title)}</h3>${d.forums.filter(f=>f.section_id===s.id).map(f=>f.link?`<div class="row"><span class="ico">${ICON[f.icon]}</span><div class="m"><a class="t" href="${esc(f.link)}" target="_blank" rel="noopener">${esc(f.title)}</a></div></div>`:`<div class="row"><span class="ico">${ICON.chat}</span><div class="m"><a class="t" href="#/forum/${f.id}">${esc(f.title)}</a><small>${esc(f.descr)}</small>${f.kids.length?`<span class="tg" onclick="this.nextElementSibling.classList.toggle('open')">Подфорумы ⌄</span><div class="subs">${f.kids.map(k=>`<a href="#/forum/${k.id}">${esc(k.title)}</a>`).join('')}</div>`:''}<small class="mob">Темы: ${f.topics} Сообщения: ${f.posts}</small></div><div class="c">Темы<b>${f.topics}</b>Сообщения<b>${f.posts}</b></div><div class="l">${f.last?`<a href="#/topic/${f.last.id}">${esc(f.last.title)}</a>${ago(f.last.last_post)} · ${esc(f.last.name)}`:'Нет'}</div></div>`).join('')}</div>`;
 const pl=u=>`<div class="pl">${av(u)}<div>${uname(u)}<small>${esc(u.title)}</small></div></div>`;
 app.innerHTML=crumbs([['Форумы']])+`<div class="head"><h1>WAIP RUSSIA — Форум</h1>${ME?`<a class="btn" href="#/post/${META.reportForum?'':''}">Создать тему...</a>`:''}</div><div class="grid"><div>${d.sections.map(sec).join('')}</div><div class="side">
 <div class="box"><h3>Команда проекта онлайн</h3>${d.team.map(pl).join('')||'<div class="stat">Никого нет</div>'}</div>
 <div class="box"><h3>Пользователи онлайн</h3>${d.online.map(pl).join('')}<div class="stat">Всего: ${d.online.length+d.guests} (пользователей: ${d.online.length}, гостей: ${d.guests})</div></div>
 <div class="box"><h3>Последние сообщения</h3>${d.recent.map(r=>`<div class="pl">${av({name:r.name,avatar:r.avatar})}<div><a href="#/topic/${r.tid}">${esc(r.body)}</a><small>От: ${esc(r.name)} · ${ago(r.created)}</small></div></div>`).join('')||'<div class="stat">Пока пусто</div>'}</div>
 <div class="box"><h3>Статистика форума</h3><div class="stat">Темы:<b>${d.stats.topics}</b></div><div class="stat">Сообщения:<b>${d.stats.posts}</b></div><div class="stat">Пользователи:<b>${d.stats.users}</b></div>${d.stats.newest?`<div class="stat">Новый пользователь:<a href="#/user/${d.stats.newest.id}">${esc(d.stats.newest.name)}</a></div>`:''}</div></div></div>`;
 const b=app.querySelector('.head .btn');if(b)b.onclick=e=>{e.preventDefault();pickForum(d)};
}
function pickForum(d){const opts=d.forums.filter(f=>!f.link&&(!f.staff_only||ME.role!=='user')).map(f=>`<option value="${f.id}">${esc(f.title)}</option>`).join('');
 app.insertAdjacentHTML('afterbegin',`<div class="box pad" id="pk"><h2>Выберите раздел</h2><select id="ps">${opts}</select><p><button class="btn" id="pg">Далее</button></p></div>`);$('#pg').onclick=()=>location.hash='#/post/'+$('#ps').value}

async function forum(id,page=1){
 const d=await api(`/forum/${id}?page=${page}`),f=d.forum;
 app.innerHTML=crumbs([['Форумы','#/'],...(d.parent?[[d.parent.title,'#/forum/'+d.parent.id]]:[]),[f.title]])+`<div class="head"><h1>${esc(f.title)}</h1>${d.canPost?`<a class="btn" href="#/post/${f.id}">Создать тему...</a>`:(!ME?'<a class="btn g" href="#/login">Войдите, чтобы писать</a>':'')}</div>`+
 (d.kids.length?`<div class="box"><h3>Подразделы</h3>${d.kids.map(k=>`<div class="row"><span class="ico">${ICON.chat}</span><div class="m"><a class="t" href="#/forum/${k.id}">${esc(k.title)}</a><small>${esc(k.descr)}</small></div></div>`).join('')}</div>`:'')+
 `<div class="box"><h3>Темы</h3>${d.topics.map(t=>`<div class="row"><span class="ico">${ICON.chat}</span><div class="m"><a class="t" href="#/topic/${t.id}">${t.pinned?'<span class="tag">📌 Закреплено</span>':''}${t.locked?'<span class="tag">🔒</span>':''}${esc(t.title)}</a><small>${esc(t.name)} · ${fmt(t.created)}<span class="mob"> · ответов: ${t.replies}</span></small></div><div class="c">Ответы<b>${t.replies}</b>Просмотры<b>${t.views}</b></div><div class="l">${ago(t.last_post)}<br>${esc(t.last_name)}</div></div>`).join('')||'<div class="pad" style="color:var(--mu)">Тем пока нет. Создайте первую!</div>'}</div>`+pager(d.page,d.pages,'#/forum/'+id);
}
async function topic(id,page=1){
 const d=await api(`/topic/${id}?page=${page}`),t=d.topic,st=ME&&ME.role!=='user';
 const first=d.posts.length&&d.posts[0].id;
 app.innerHTML=crumbs([['Форумы','#/'],[d.forum.title,'#/forum/'+d.forum.id],[t.title]])+`<div class="head"><h1>${t.pinned?'📌 ':''}${t.locked?'🔒 ':''}${esc(t.title)}</h1>${st?`<div class="acts" style="margin:0"><button class="btn sm g" data-m="pin">${t.pinned?'Открепить':'Закрепить'}</button><button class="btn sm g" data-m="lock">${t.locked?'Открыть':'Закрыть'}</button><button class="btn sm g" data-m="move">Переместить</button><button class="btn sm r" data-m="delete">Удалить тему</button></div>`:''}</div>
 <div class="box">${d.posts.map(p=>`<div class="post" id="p${p.id}"><div class="au">${av(p)}<div><a class="role-${p.role}" href="#/user/${p.user_id}">${esc(p.name)}</a>${p.banned?'<span class="tag" style="background:#5b1426">Заблокирован</span><br>':''}${esc(p.utitle)}<br>Сообщений: ${p.ucount}</div></div><div class="pb"><div class="pm"><span>${fmt(p.created)}${p.edited?' · изменено':''}</span><span>#${p.id}</span></div><div class="body" id="b${p.id}">${body(p.body)}</div><div class="acts">
 ${ME?`<button class="btn sm g" data-l="${p.id}">👍 ${p.likes}${p.liked?' ✓':''}</button><button class="btn sm g" data-q="${p.id}">Цитата</button>`:`<span class="tag">👍 ${p.likes}</span>`}
 ${ME&&(ME.id===p.user_id||st)?`<button class="btn sm g" data-e="${p.id}">${editIco} Изменить</button><button class="btn sm r" data-d="${p.id}">Удалить</button>`:''}</div></div></div>`).join('')}</div>`+pager(d.page,d.pages,'#/topic/'+id)+
 (ME?(t.locked&&!st?'<div class="box pad">Тема закрыта</div>':`<div class="box pad"><h2>Ответить</h2><textarea id="rb" placeholder="Ваше сообщение..."></textarea><p><button class="btn" id="rs">Отправить</button> <span class="err" id="re"></span></p></div>`):`<div class="box pad">Чтобы отвечать, <a href="#/login">войдите</a> или <a href="#/register">зарегистрируйтесь</a>.</div>`);
 const raw={};d.posts.forEach(p=>raw[p.id]=p);
 app.querySelectorAll('[data-m]').forEach(b=>b.onclick=async()=>{const a=b.dataset.m;if(a==='delete'&&!confirm('Удалить тему?'))return;let fid;if(a==='move'){fid=prompt('ID раздела (виден в адресе #/forum/ID):');if(!fid)return}
  await api(`/topic/${id}/mod`,'POST',{action:a,forum_id:fid});if(a==='delete')location.hash='#/';else route()});
 app.querySelectorAll('[data-l]').forEach(b=>b.onclick=async()=>{await api('/like/'+b.dataset.l,'POST');route()});
 app.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{const p=raw[b.dataset.q],r=$('#rb');if(!r)return;r.value+=(r.value?'\n':'')+'> '+p.name+': '+p.body.split('\n')[0].slice(0,200)+'\n\n';r.focus();r.scrollIntoView({block:'center'})});
 app.querySelectorAll('[data-d]').forEach(b=>b.onclick=async()=>{if(!confirm('Удалить сообщение?'))return;const r=await api('/post/'+b.dataset.d,'DELETE');if(r.topicDeleted)location.hash='#/';else route()});
 app.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>{const id=b.dataset.e,el=$('#b'+id);el.innerHTML=`<textarea id="ed">${esc(raw[id].body)}</textarea><p><button class="btn sm" id="es">Сохранить</button> <button class="btn sm g" id="ec">Отмена</button></p>`;$('#ec').onclick=()=>el.innerHTML=body(raw[id].body);$('#es').onclick=async()=>{try{await api('/post/'+id,'PUT',{body:$('#ed').value});route()}catch(e){toast(e.message)}}});
 const rs=$('#rs');if(rs)rs.onclick=async()=>{try{const r=await api('/post','POST',{topic_id:id,body:$('#rb').value});location.hash=`#/topic/${id}/${r.page}`;route()}catch(e){$('#re').textContent=e.message}};
}
async function newPost(fid){
 if(!ME)return location.hash='#/login';
 app.innerHTML=crumbs([['Форумы','#/'],['Новая тема']])+`<div class="box pad form" style="max-width:800px"><h1>Создать тему</h1><label>Заголовок</label><input id="tt" maxlength="120"><label>Сообщение</label><textarea id="tb" style="min-height:240px"></textarea><p><button class="btn" id="ts">Опубликовать</button></p><div class="err" id="te"></div></div>`;
 $('#ts').onclick=async()=>{try{const r=await api('/topic','POST',{forum_id:+fid,title:$('#tt').value,body:$('#tb').value});location.hash='#/topic/'+r.id}catch(e){$('#te').textContent=e.message}};
}
function auth(reg){
 app.innerHTML=`<div class="box pad form"><h1>${reg?'Регистрация':'Вход'}</h1><label>Ник</label><input id="un" autocomplete="username"><label>Пароль</label><input id="pw" type="password" autocomplete="${reg?'new-password':'current-password'}"><p><button class="btn" id="go">${reg?'Создать аккаунт':'Войти'}</button></p><div class="err" id="ae"></div><p style="color:var(--mu)">${reg?'Уже есть аккаунт? <a href="#/login">Войти</a>':'Нет аккаунта? <a href="#/register">Регистрация</a>'}</p></div>`;
 const go=async()=>{try{await api(reg?'/register':'/login','POST',{name:$('#un').value,pass:$('#pw').value});await loadMe();location.hash='#/'}catch(e){$('#ae').textContent=e.message}};$('#go').onclick=go;$('#pw').onkeydown=e=>e.key==='Enter'&&go();
}
async function user(id){
 const d=await api('/user/'+id),u=d.user,me=ME&&ME.id===u.id;
 app.innerHTML=crumbs([['Пользователи','#/users'],[u.name]])+`<div class="box pad" style="display:flex;gap:18px;flex-wrap:wrap">${av(u,'l')}<div style="flex:1;min-width:200px"><h1 class="role-${u.role}">${esc(u.name)}</h1><div style="color:var(--mu)">${esc(u.title)}${u.banned?' · <b style="color:#ff6b86">заблокирован</b>':''}</div><p>${esc(u.about)||'<span style="color:var(--mu)">О себе ничего не указано</span>'}</p><div class="stat" style="padding:0;justify-content:flex-start;gap:18px;flex-wrap:wrap"><span>Регистрация: <b>${fmt(u.created)}</b></span><span>Сообщений: <b>${d.posts}</b></span><span>Тем: <b>${d.topics}</b></span><span>Оценок: <b>${d.likes}</b></span><span>Был: <b>${ago(u.last_seen)}</b></span></div></div></div>
 ${me?`<div class="box pad"><h2>Редактировать профиль</h2><label>Ссылка на аватар (https://...)</label><input id="pa" value="${esc(u.avatar||'')}"><label>О себе</label><textarea id="pab" style="min-height:90px">${esc(u.about)}</textarea><p><button class="btn" id="ps">Сохранить</button></p><h2>Смена пароля</h2><input id="op" type="password" placeholder="Старый пароль"><br><br><input id="np" type="password" placeholder="Новый пароль"><p><button class="btn g" id="pp">Сменить пароль</button></p></div>`:''}
 <div class="box"><h3>Последние темы</h3>${d.recent.map(t=>`<div class="row"><div class="m"><a class="t" href="#/topic/${t.id}">${esc(t.title)}</a><small>${fmt(t.created)}</small></div></div>`).join('')||'<div class="pad" style="color:var(--mu)">Нет тем</div>'}</div>`;
 if(me){$('#ps').onclick=async()=>{await api('/me','PUT',{avatar:$('#pa').value,about:$('#pab').value});toast('Сохранено');await loadMe();route()};$('#pp').onclick=async()=>{try{await api('/password','POST',{old:$('#op').value,pass:$('#np').value});toast('Пароль изменён')}catch(e){toast(e.message)}}}
}
async function users(){
 const l=await api('/users');
 app.innerHTML=crumbs([['Пользователи']])+`<div class="box"><h3>Пользователи (${l.length})</h3>${l.map(u=>`<div class="pl">${av(u)}<div>${uname(u)}<small>${esc(u.title)} · с ${fmt(u.created)}</small></div></div>`).join('')}</div>`;
}
async function search(q){const l=await api('/search?q='+encodeURIComponent(q));
 app.innerHTML=crumbs([['Поиск']])+`<h1>Поиск: ${esc(q)}</h1><div class="box">${l.map(t=>`<div class="row"><div class="m"><a class="t" href="#/topic/${t.id}">${esc(t.title)}</a><small>${esc(t.ftitle)} · ${esc(t.name)} · ${ago(t.last_post)}</small></div></div>`).join('')||'<div class="pad" style="color:var(--mu)">Ничего не найдено. Попробуйте другой запрос.</div>'}</div>`}
async function newest(){const d=await api('/index');
 app.innerHTML=crumbs([['Что нового?']])+`<h1>Что нового?</h1><div class="box"><h3>Последние сообщения</h3>${d.recent.map(r=>`<div class="pl">${av({name:r.name,avatar:r.avatar})}<div><a href="#/topic/${r.tid}">${esc(r.title)}</a><small>${esc(r.name)}: ${esc(r.body)} · ${ago(r.created)}</small></div></div>`).join('')||'<div class="pad">Пока пусто</div>'}</div>`}
async function notifs(){if(!ME)return location.hash='#/login';const l=await api('/notifs');await api('/notifs/read','POST');META.unread=0;renderTop();
 app.innerHTML=crumbs([['Уведомления']])+`<h1>Уведомления</h1><div class="box">${l.map(n=>`<div class="row"><div class="m"><a class="t" href="${esc(n.link)}">${esc(n.text)}</a><small>${ago(n.created)}</small></div></div>`).join('')||'<div class="pad" style="color:var(--mu)">Уведомлений нет</div>'}</div>`}
function rules(){app.innerHTML=crumbs([['Правила форума']])+`<h1>Правила форума</h1><div class="box pad body">${body(META.rules)}</div>`}
async function admin(){
 if(!ME||ME.role!=='admin')return location.hash='#/';
 const [d,us]=await Promise.all([api('/index'),api('/users')]);const all=await Promise.all(d.forums.map(f=>api('/forum/'+f.id)));
 const secOpts=d.sections.map(s=>`<option value="${s.id}">${esc(s.title)}</option>`).join('');
 app.innerHTML=crumbs([['Админ-панель']])+`<h1>Админ-панель</h1>
 <div class="box pad"><h2>Разделы и форумы</h2>${d.sections.map(s=>`<p><b>${esc(s.title)}</b> <button class="btn sm r" data-ds="${s.id}">×</button></p>${d.forums.filter(f=>f.section_id===s.id).map(f=>`<div class="stat">${esc(f.title)} (ID ${f.id}) <button class="btn sm r" data-df="${f.id}">Удалить</button></div>`).join('')}`).join('')}</div>
 <div class="box pad"><h2>Добавить раздел</h2><input id="st" placeholder="Название раздела"><p><button class="btn" id="sa">Добавить</button></p>
 <h2>Добавить форум</h2><select id="fs">${secOpts}</select><br><br><input id="ft" placeholder="Название"><br><br><input id="fd" placeholder="Описание"><br><br><input id="fl" placeholder="Внешняя ссылка (Telegram/Discord), если это ссылка"><br><br><input id="fp" placeholder="ID родительского форума (для подфорума)"><br><br><label><input type="checkbox" id="fo" style="width:auto"> Только персонал может создавать темы</label><p><button class="btn" id="fa">Добавить форум</button></p></div>
 <div class="box pad"><h2>Правила форума</h2><textarea id="ru">${esc(META.rules)}</textarea><p><button class="btn" id="rs">Сохранить правила</button></p></div>
 <div class="box" style="overflow-x:auto"><h3>Пользователи</h3><table>${us.map(u=>`<tr><td>${esc(u.name)}</td><td><select data-r="${u.id}" style="padding:4px"><option value="user"${u.role==='user'?' selected':''}>Пользователь</option><option value="mod"${u.role==='mod'?' selected':''}>Модератор</option><option value="admin"${u.role==='admin'?' selected':''}>Админ</option></select></td><td><input data-t="${u.id}" value="${esc(u.title)}" style="padding:4px"></td><td><button class="btn sm ${u.banned?'':'r'}" data-b="${u.id}" data-v="${u.banned?0:1}">${u.banned?'Разбанить':'Бан'}</button></td></tr>`).join('')}</table></div>`;
 const go=async(f)=>{try{await f();admin()}catch(e){toast(e.message)}};
 app.querySelectorAll('[data-ds]').forEach(b=>b.onclick=()=>go(()=>api('/admin/section/'+b.dataset.ds,'DELETE')));
 app.querySelectorAll('[data-df]').forEach(b=>b.onclick=()=>confirm('Удалить форум со всеми темами?')&&go(()=>api('/admin/forum/'+b.dataset.df,'DELETE')));
 app.querySelectorAll('[data-r]').forEach(s=>s.onchange=()=>go(()=>api('/admin/user/'+s.dataset.r,'PUT',{role:s.value})));
 app.querySelectorAll('[data-t]').forEach(s=>s.onchange=()=>api('/admin/user/'+s.dataset.t,'PUT',{title:s.value}).then(()=>toast('Сохранено')));
 app.querySelectorAll('[data-b]').forEach(b=>b.onclick=()=>go(()=>api('/admin/user/'+b.dataset.b,'PUT',{banned:+b.dataset.v})));
 $('#sa').onclick=()=>go(()=>api('/admin/section','POST',{title:$('#st').value}));
 $('#fa').onclick=()=>go(()=>api('/admin/forum','POST',{section_id:$('#fs').value,title:$('#ft').value,descr:$('#fd').value,link:$('#fl').value,parent_id:$('#fp').value,staff_only:$('#fo').checked}));
 $('#rs').onclick=async()=>{await api('/admin/rules','PUT',{rules:$('#ru').value});META.rules=$('#ru').value;toast('Сохранено')};
}
async function route(){
 const h=(location.hash||'#/').slice(1),p=h.split('/').filter(Boolean);renderTop();window.scrollTo(0,0);
 try{const a=p[0];
  if(!a)await home();else if(a==='forum')await forum(p[1],p[2]);else if(a==='topic')await topic(p[1],p[2]);else if(a==='post')await newPost(p[1]);
  else if(a==='login')auth(0);else if(a==='register')auth(1);else if(a==='user')await user(p[1]);else if(a==='users')await users();
  else if(a==='search')await search(decodeURIComponent(p[1]||''));else if(a==='new')await newest();else if(a==='notifs')await notifs();
  else if(a==='rules')rules();else if(a==='admin')await admin();else await home();
 }catch(e){app.innerHTML=`<div class="box pad form"><h2>Ошибка</h2><p>${esc(e.message)}</p><a class="btn" href="#/">На главную</a></div>`}
}
addEventListener('hashchange',route);loadMe().then(route);
