const express=require('express'),Database=require('better-sqlite3'),crypto=require('crypto'),path=require('path'),fs=require('fs');
const DATA=process.env.DATA_DIR||path.join(__dirname,'data');fs.mkdirSync(DATA,{recursive:true});
const db=new Database(path.join(DATA,'forum.db'));db.pragma('journal_mode=WAL');db.pragma('foreign_keys=ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT UNIQUE COLLATE NOCASE,pass TEXT,salt TEXT,role TEXT DEFAULT 'user',title TEXT,avatar TEXT,about TEXT DEFAULT '',banned INTEGER DEFAULT 0,created INTEGER,last_seen INTEGER);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER,created INTEGER);
CREATE TABLE IF NOT EXISTS sections(id INTEGER PRIMARY KEY,title TEXT,icon TEXT DEFAULT 'chat',pos INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS forums(id INTEGER PRIMARY KEY,section_id INTEGER,parent_id INTEGER,title TEXT,descr TEXT DEFAULT '',icon TEXT DEFAULT 'chat',link TEXT,staff_only INTEGER DEFAULT 0,pos INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS topics(id INTEGER PRIMARY KEY,forum_id INTEGER,user_id INTEGER,title TEXT,pinned INTEGER DEFAULT 0,locked INTEGER DEFAULT 0,views INTEGER DEFAULT 0,created INTEGER,last_post INTEGER);
CREATE TABLE IF NOT EXISTS posts(id INTEGER PRIMARY KEY,topic_id INTEGER,user_id INTEGER,body TEXT,created INTEGER,edited INTEGER);
CREATE TABLE IF NOT EXISTS likes(post_id INTEGER,user_id INTEGER,PRIMARY KEY(post_id,user_id));
CREATE TABLE IF NOT EXISTS notifs(id INTEGER PRIMARY KEY,user_id INTEGER,text TEXT,link TEXT,read INTEGER DEFAULT 0,created INTEGER);
CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY,v TEXT);
CREATE INDEX IF NOT EXISTS i_t ON topics(forum_id,pinned,last_post);CREATE INDEX IF NOT EXISTS i_p ON posts(topic_id,id);
CREATE TABLE IF NOT EXISTS prefixes(id INTEGER PRIMARY KEY,text TEXT,color TEXT,staff_only INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS chat(id INTEGER PRIMARY KEY,user_id INTEGER,body TEXT,created INTEGER);
`);
const addCol=(t,c,d)=>{try{db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${d}`)}catch(e){}};
addCol('users','verified','INTEGER DEFAULT 0');addCol('users','color','TEXT');addCol('users','prefix','TEXT');addCol('users','prefix_color','TEXT');addCol('users','perms',"TEXT DEFAULT '[]'");
addCol('topics','prefix_id','INTEGER');addCol('topics','status','TEXT');addCol('topics','status_by','INTEGER');addCol('topics','status_at','INTEGER');
addCol('forums','is_apps','INTEGER DEFAULT 0');addCol('likes','emoji',"TEXT DEFAULT '👍'");
const now=()=>Date.now(),TG=process.env.TELEGRAM_URL||'https://t.me/',DS=process.env.DISCORD_URL||'https://discord.gg/';
if(!db.prepare('SELECT 1 FROM sections').get()){
 const S=db.prepare('INSERT INTO sections(title,icon,pos) VALUES(?,?,?)'),F=db.prepare('INSERT INTO forums(section_id,parent_id,title,descr,icon,link,staff_only,pos) VALUES(?,?,?,?,?,?,?,?)');
 const a=S.run('Основной раздел','chat',1).lastInsertRowid,b=S.run('Игровые серверы','crown',2).lastInsertRowid;
 F.run(a,null,'Новости и информация','','chat',null,1,1);
 const t=F.run(a,null,'Технический раздел','','chat',null,0,2).lastInsertRowid;
 F.run(a,t,'Баги и ошибки','Сообщения об ошибках на сервере','chat',null,0,1);F.run(a,t,'Помощь новичкам','','chat',null,0,2);
 F.run(a,null,'Предложения по улучшению','','chat',null,0,3);F.run(a,null,'Приемная руководства проекта','','chat',null,0,4);
 F.run(a,null,'Администрация проекта','','chat',null,0,5);F.run(a,null,'Жалобы','Жалобы на игроков и администрацию','chat',null,0,6);
 F.run(a,null,'Официальный Telegram-канал','','tg',TG,0,7);F.run(a,null,'Официальное сообщество в Discord','','ds',DS,0,8);
 F.run(b,null,'Главный сервер','Подключился и играй!','chat',null,0,1);F.run(b,null,'Игровой сервер №1 | Москва','','chat',null,0,2);
 db.prepare("INSERT INTO settings VALUES('rules',?)").run('1. Уважайте других участников.\n2. Запрещены оскорбления, флуд и реклама.\n3. Создавайте темы в соответствующих разделах.\n4. Жалобы подавайте по форме в разделе «Жалобы».\n5. Администрация вправе наказать за нарушение правил.');
}
if(!db.prepare('SELECT 1 FROM prefixes').get()){const P=db.prepare('INSERT INTO prefixes(text,color,staff_only) VALUES(?,?,?)');P.run('Важно','#e5173f',1);P.run('Информация','#e0456b',0);P.run('Опрос','#d4b300',0);P.run('Баг','#e8761a',0);P.run('Предложение','#20b486',0);P.run('Заявка','#2d8bff',0)}
if(!db.prepare("SELECT 1 FROM settings WHERE k='apps_init'").get()){db.prepare("UPDATE forums SET is_apps=1 WHERE title IN('Жалобы','Приемная руководства проекта')").run();db.prepare("INSERT INTO settings VALUES('apps_init','1')").run()}
const hash=(p,s)=>crypto.scryptSync(p,s,32).toString('hex');
const app=express();app.set('trust proxy',1);app.use(express.json({limit:'200kb'}));
const cookie=(req,n)=>((req.headers.cookie||'').split('; ').find(c=>c.startsWith(n+'='))||'').slice(n.length+1);
const guests=new Map();
app.use((req,res,next)=>{
 const tk=cookie(req,'sid');req.user=null;
 if(tk){const u=db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?').get(tk);if(u){req.user=u;if(now()-(u.last_seen||0)>60000)db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(now(),u.id)}}
 if(!req.user&&req.path.startsWith('/api')){guests.set(req.ip+(req.headers['user-agent']||''),now())}
 next();
});
const err=(res,m,c=400)=>res.status(c).json({error:m});
const staff=u=>u&&(u.role==='admin'||u.role==='mod'),admin=u=>u&&u.role==='admin';
const perms=u=>{try{return JSON.parse(u.perms||'[]')}catch(e){return[]}};
const PERMS=['pin','lock','move','delete_topic','delete_post','edit_post','ban','status','topic_prefix','chat','staff_forum'];
const can=(u,p)=>!!u&&!u.banned&&(u.role==='admin'||(u.role==='mod'&&perms(u).includes(p)));
const hex=c=>/^#[0-9a-fA-F]{6}$/.test(c||'')?c:null;
const rank=p=>p<10?'Новичок':p<50?'Активный':p<150?'Опытный':p<500?'Ветеран':'Легенда';
const ST=['review','approved','rejected','checked'],STL={review:'На рассмотрении',approved:'Одобрено',rejected:'Отказано',checked:'Проверено'},EMO=['👍','❤️','🔥','😂','😮','😢'];
const need=(req,res)=>{if(!req.user){err(res,'Войдите в аккаунт',401);return false}if(req.user.banned){err(res,'Ваш аккаунт заблокирован',403);return false}return true};
const lastW=new Map();const slow=(req,res)=>{const k=req.user.id,t=lastW.get(k)||0;if(now()-t<3000&&!staff(req.user)){err(res,'Слишком часто. Подождите пару секунд',429);return true}lastW.set(k,now());return false};
const RP={admin:'Главный администратор',mod:'Модератор'},RC={admin:'#e5173f',mod:'#f59e0b'};
const pub=u=>u&&{id:u.id,name:u.name,role:u.role,prefix:u.prefix||RP[u.role]||null,pcolor:u.prefix_color||RC[u.role]||'#2d8bff',color:u.color||null,verified:!!u.verified,avatar:u.avatar,about:u.about,banned:u.banned,created:u.created,last_seen:u.last_seen};
const cleanUrl=s=>/^https?:\/\/\S{1,300}$/.test(s||'')?s:null;
const notify=(uid,text,link)=>db.prepare('INSERT INTO notifs(user_id,text,link,created) VALUES(?,?,?,?)').run(uid,text,link,now());

app.post('/api/register',(req,res)=>{
 const n=String(req.body.name||'').trim(),p=String(req.body.pass||'');
 if(!/^[A-Za-z0-9_А-Яа-яЁё]{3,20}$/.test(n))return err(res,'Ник: 3–20 символов, буквы, цифры, _');
 if(p.length<6)return err(res,'Пароль минимум 6 символов');
 if(db.prepare('SELECT 1 FROM users WHERE name=?').get(n))return err(res,'Ник уже занят');
 const first=!db.prepare('SELECT 1 FROM users').get(),salt=crypto.randomBytes(16).toString('hex');
 const id=db.prepare('INSERT INTO users(name,pass,salt,role,created,last_seen) VALUES(?,?,?,?,?,?)').run(n,hash(p,salt),salt,first?'admin':'user',now(),now()).lastInsertRowid;
 login(res,id);res.json({ok:1});
});
function login(res,id){const t=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(t,id,now());res.setHeader('Set-Cookie',`sid=${t}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax${process.env.NODE_ENV==='production'?'; Secure':''}`)}
app.post('/api/login',(req,res)=>{
 const u=db.prepare('SELECT * FROM users WHERE name=?').get(String(req.body.name||'').trim());
 if(!u||hash(String(req.body.pass||''),u.salt)!==u.pass)return err(res,'Неверный ник или пароль');
 login(res,u.id);res.json({ok:1});
});
app.post('/api/logout',(req,res)=>{const t=cookie(req,'sid');db.prepare('DELETE FROM sessions WHERE token=?').run(t);res.setHeader('Set-Cookie','sid=; Path=/; Max-Age=0');res.json({ok:1})});
app.get('/api/me',(req,res)=>{
 const u=req.user;res.json({user:u&&{...pub(u),perms:perms(u)},unread:u?db.prepare('SELECT COUNT(*) c FROM notifs WHERE user_id=? AND read=0').get(u.id).c:0,rules:db.prepare("SELECT v FROM settings WHERE k='rules'").get().v,reportForum:(db.prepare("SELECT id FROM forums WHERE title='Жалобы'").get()||{}).id});
});
app.put('/api/me',(req,res)=>{
 if(!need(req,res))return;const av=req.body.avatar?cleanUrl(req.body.avatar):null;
 db.prepare('UPDATE users SET about=?,avatar=? WHERE id=?').run(String(req.body.about||'').slice(0,500),av,req.user.id);res.json({ok:1});
});
app.post('/api/password',(req,res)=>{
 if(!need(req,res))return;const u=req.user;
 if(hash(String(req.body.old||''),u.salt)!==u.pass)return err(res,'Старый пароль неверный');
 if(String(req.body.pass||'').length<6)return err(res,'Пароль минимум 6 символов');
 const s=crypto.randomBytes(16).toString('hex');db.prepare('UPDATE users SET pass=?,salt=? WHERE id=?').run(hash(req.body.pass,s),s,u.id);res.json({ok:1});
});

app.get('/api/index',(req,res)=>{
 const secs=db.prepare('SELECT * FROM sections ORDER BY pos,id').all(),fs_=db.prepare('SELECT * FROM forums ORDER BY pos,id').all();
 const cnt=db.prepare('SELECT COUNT(*) c FROM topics WHERE forum_id=?'),pc=db.prepare('SELECT COUNT(*) c FROM posts p JOIN topics t ON t.id=p.topic_id WHERE t.forum_id=?');
 const last=db.prepare('SELECT t.id,t.title,t.last_post,u.name FROM topics t JOIN users u ON u.id=t.user_id WHERE t.forum_id=? ORDER BY t.last_post DESC LIMIT 1');
 const forums=fs_.map(f=>{const kids=fs_.filter(k=>k.parent_id===f.id),ids=[f.id,...kids.map(k=>k.id)];
  let t=0,p=0,l=null;ids.forEach(i=>{t+=cnt.get(i).c;p+=pc.get(i).c;const x=last.get(i);if(x&&(!l||x.last_post>l.last_post))l=x});
  return{...f,topics:t,posts:p,last:l,kids:kids.map(k=>({id:k.id,title:k.title}))}}).filter(f=>!f.parent_id);
 const on=now()-300000;
 const online=db.prepare('SELECT * FROM users WHERE last_seen>? ORDER BY role,name').all(on).map(pub);
 for(const[k,v]of guests)if(v<on)guests.delete(k);
 const recent=db.prepare('SELECT p.id,p.body,p.created,t.id tid,t.title,u.id uid,u.name,u.avatar FROM posts p JOIN topics t ON t.id=p.topic_id JOIN users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT 5').all().map(r=>({...r,body:r.body.slice(0,60)}));
 const st={topics:db.prepare('SELECT COUNT(*) c FROM topics').get().c,posts:db.prepare('SELECT COUNT(*) c FROM posts').get().c,users:db.prepare('SELECT COUNT(*) c FROM users').get().c,newest:db.prepare('SELECT id,name FROM users ORDER BY id DESC LIMIT 1').get()};
 const top=db.prepare('SELECT u.*,(SELECT COUNT(*) FROM posts WHERE user_id=u.id)+2*(SELECT COUNT(*) FROM likes l JOIN posts p ON p.id=l.post_id WHERE p.user_id=u.id) pts FROM users u ORDER BY pts DESC LIMIT 5').all().map(u=>({...pub(u),pts:u.pts,rank:rank(u.pts)}));
 res.json({top,sections:secs,forums,team:online.filter(u=>u.role!=='user'),online,guests:guests.size,recent,stats:st});
});
const PT=20,PP=15;
app.get('/api/forum/:id',(req,res)=>{
 const f=db.prepare('SELECT * FROM forums WHERE id=?').get(req.params.id);if(!f)return err(res,'Раздел не найден',404);
 const page=Math.max(1,+req.query.page||1),total=db.prepare('SELECT COUNT(*) c FROM topics WHERE forum_id=?').get(f.id).c;
 const topics=db.prepare(`SELECT t.*,u.name,(SELECT COUNT(*)-1 FROM posts WHERE topic_id=t.id) replies,(SELECT u2.name FROM posts p JOIN users u2 ON u2.id=p.user_id WHERE p.topic_id=t.id ORDER BY p.id DESC LIMIT 1) last_name,pr.text ptext,pr.color pcol FROM topics t JOIN users u ON u.id=t.user_id LEFT JOIN prefixes pr ON pr.id=t.prefix_id WHERE t.forum_id=? ORDER BY t.pinned DESC,t.last_post DESC LIMIT ? OFFSET ?`).all(f.id,PT,(page-1)*PT);
 res.json({forum:f,parent:f.parent_id?db.prepare('SELECT id,title FROM forums WHERE id=?').get(f.parent_id):null,kids:db.prepare('SELECT * FROM forums WHERE parent_id=? ORDER BY pos').all(f.id),topics,page,pages:Math.ceil(total/PT)||1,canPost:!!req.user&&!req.user.banned&&(!f.staff_only||can(req.user,'staff_forum'))});
});
app.post('/api/topic',(req,res)=>{
 if(!need(req,res)||slow(req,res))return;
 const f=db.prepare('SELECT * FROM forums WHERE id=?').get(req.body.forum_id),title=String(req.body.title||'').trim(),body=String(req.body.body||'').trim();
 if(!f||f.link)return err(res,'Раздел недоступен');if(f.staff_only&&!can(req.user,'staff_forum'))return err(res,'Здесь создавать темы может только персонал',403);
 if(title.length<3||title.length>120)return err(res,'Заголовок: 3–120 символов');if(body.length<2||body.length>20000)return err(res,'Сообщение слишком короткое или длинное');
 let pid=null;if(req.body.prefix_id){const pr=db.prepare('SELECT * FROM prefixes WHERE id=?').get(+req.body.prefix_id);if(pr&&(!pr.staff_only||can(req.user,'topic_prefix')))pid=pr.id}
 const t=now(),id=db.prepare('INSERT INTO topics(forum_id,user_id,title,created,last_post,prefix_id,status) VALUES(?,?,?,?,?,?,?)').run(f.id,req.user.id,title,t,t,pid,f.is_apps?'review':null).lastInsertRowid;
 db.prepare('INSERT INTO posts(topic_id,user_id,body,created) VALUES(?,?,?,?)').run(id,req.user.id,body,t);res.json({id});
});
app.get('/api/prefixes',(req,res)=>res.json(db.prepare('SELECT * FROM prefixes ORDER BY id').all()));
app.get('/api/topic/:id',(req,res)=>{
 const t=db.prepare('SELECT t.*,u.name,pr.text ptext,pr.color pcol FROM topics t JOIN users u ON u.id=t.user_id LEFT JOIN prefixes pr ON pr.id=t.prefix_id WHERE t.id=?').get(req.params.id);if(!t)return err(res,'Тема не найдена',404);
 db.prepare('UPDATE topics SET views=views+1 WHERE id=?').run(t.id);
 const page=Math.max(1,+req.query.page||1),total=db.prepare('SELECT COUNT(*) c FROM posts WHERE topic_id=?').get(t.id).c,me=req.user?req.user.id:0;
 const posts=db.prepare(`SELECT p.*,u.name,u.avatar,u.role,u.color,u.verified,u.prefix,u.prefix_color,u.banned,(SELECT COUNT(*) FROM posts WHERE user_id=u.id) ucount FROM posts p JOIN users u ON u.id=p.user_id WHERE p.topic_id=? ORDER BY p.id LIMIT ? OFFSET ?`).all(t.id,PP,(page-1)*PP).map(p=>({...p,prefix:p.prefix||RP[p.role]||null,pcolor:p.prefix_color||RC[p.role]||'#2d8bff',verified:!!p.verified}));
 const rx=db.prepare('SELECT emoji,COUNT(*) c,SUM(user_id=?) mine FROM likes WHERE post_id=? GROUP BY emoji');posts.forEach(p=>p.reactions=rx.all(me,p.id));
 const f=db.prepare('SELECT id,title,parent_id FROM forums WHERE id=?').get(t.forum_id),checker=t.status_by?pub(db.prepare('SELECT * FROM users WHERE id=?').get(t.status_by)):null;
 res.json({topic:t,forum:f,posts,page,pages:Math.ceil(total/PP)||1,checker,prefixes:db.prepare('SELECT * FROM prefixes ORDER BY id').all()});
});
app.post('/api/post',(req,res)=>{
 if(!need(req,res)||slow(req,res))return;
 const t=db.prepare('SELECT * FROM topics WHERE id=?').get(req.body.topic_id),body=String(req.body.body||'').trim();
 if(!t)return err(res,'Тема не найдена',404);if(t.locked&&!can(req.user,'lock'))return err(res,'Тема закрыта',403);if(body.length<1||body.length>20000)return err(res,'Сообщение пустое или слишком длинное');
 const id=db.prepare('INSERT INTO posts(topic_id,user_id,body,created) VALUES(?,?,?,?)').run(t.id,req.user.id,body,now()).lastInsertRowid;
 db.prepare('UPDATE topics SET last_post=? WHERE id=?').run(now(),t.id);
 if(t.user_id!==req.user.id)notify(t.user_id,`${req.user.name} ответил в теме «${t.title}»`,`#/topic/${t.id}`);
 const total=db.prepare('SELECT COUNT(*) c FROM posts WHERE topic_id=?').get(t.id).c;res.json({id,page:Math.ceil(total/PP)});
});
app.put('/api/post/:id',(req,res)=>{
 if(!need(req,res))return;const p=db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);if(!p)return err(res,'Нет сообщения',404);
 if(p.user_id!==req.user.id&&!can(req.user,'edit_post'))return err(res,'Нет прав',403);const b=String(req.body.body||'').trim();if(!b)return err(res,'Пусто');
 db.prepare('UPDATE posts SET body=?,edited=? WHERE id=?').run(b.slice(0,20000),now(),p.id);res.json({ok:1});
});
app.delete('/api/post/:id',(req,res)=>{
 if(!need(req,res))return;const p=db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);if(!p)return err(res,'Нет сообщения',404);
 if(p.user_id!==req.user.id&&!can(req.user,'delete_post'))return err(res,'Нет прав',403);
 const first=db.prepare('SELECT id FROM posts WHERE topic_id=? ORDER BY id LIMIT 1').get(p.topic_id).id===p.id;
 if(first&&p.user_id!==req.user.id&&!can(req.user,'delete_topic'))return err(res,'Нет прав',403);
 if(first){db.prepare('DELETE FROM posts WHERE topic_id=?').run(p.topic_id);db.prepare('DELETE FROM topics WHERE id=?').run(p.topic_id);return res.json({topicDeleted:1})}
 db.prepare('DELETE FROM posts WHERE id=?').run(p.id);res.json({ok:1});
});
app.post('/api/like/:id',(req,res)=>{
 if(!need(req,res))return;const p=db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);if(!p)return err(res,'Нет сообщения',404);
 const em=EMO.includes(req.body.emoji)?req.body.emoji:'👍',e=db.prepare('SELECT emoji FROM likes WHERE post_id=? AND user_id=?').get(p.id,req.user.id);
 if(e&&e.emoji===em)db.prepare('DELETE FROM likes WHERE post_id=? AND user_id=?').run(p.id,req.user.id);
 else{db.prepare('INSERT OR REPLACE INTO likes(post_id,user_id,emoji) VALUES(?,?,?)').run(p.id,req.user.id,em);if(!e&&p.user_id!==req.user.id)notify(p.user_id,`${req.user.name} отреагировал ${em} на ваше сообщение`,`#/topic/${p.topic_id}`)}
 res.json({ok:1});
});
app.post('/api/topic/:id/mod',(req,res)=>{
 if(!need(req,res))return;const id=+req.params.id,a=req.body.action,t=db.prepare('SELECT * FROM topics WHERE id=?').get(id);if(!t)return err(res,'Тема не найдена',404);
 const pm={pin:'pin',lock:'lock',delete:'delete_topic',move:'move',status:'status',prefix:'topic_prefix'}[a];
 if(!pm||!can(req.user,pm))return err(res,'Нет прав на это действие',403);
 if(a==='pin')db.prepare('UPDATE topics SET pinned=1-pinned WHERE id=?').run(id);
 else if(a==='lock')db.prepare('UPDATE topics SET locked=1-locked WHERE id=?').run(id);
 else if(a==='delete'){db.prepare('DELETE FROM posts WHERE topic_id=?').run(id);db.prepare('DELETE FROM topics WHERE id=?').run(id)}
 else if(a==='move'){if(!db.prepare('SELECT 1 FROM forums WHERE id=? AND link IS NULL').get(+req.body.forum_id))return err(res,'Раздел не найден');db.prepare('UPDATE topics SET forum_id=? WHERE id=?').run(+req.body.forum_id,id)}
 else if(a==='prefix'){db.prepare('UPDATE topics SET prefix_id=? WHERE id=?').run(+req.body.prefix_id||null,id)}
 else if(a==='status'){const st=req.body.status;if(st&&!ST.includes(st))return err(res,'Неверный статус');
  db.prepare('UPDATE topics SET status=?,status_by=?,status_at=? WHERE id=?').run(st||null,st?req.user.id:null,st?now():null,id);
  if(st&&t.user_id!==req.user.id)notify(t.user_id,`Ваша заявка «${t.title}»: ${STL[st]} (${req.user.name})`,`#/topic/${id}`)}
 res.json({ok:1});
});
app.get('/api/user/:id',(req,res)=>{
 const u=db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);if(!u)return err(res,'Пользователь не найден',404);
 const posts=db.prepare('SELECT COUNT(*) c FROM posts WHERE user_id=?').get(u.id).c,likes=db.prepare('SELECT COUNT(*) c FROM likes l JOIN posts p ON p.id=l.post_id WHERE p.user_id=?').get(u.id).c,points=posts+likes*2;
 res.json({user:pub(u),posts,topics:db.prepare('SELECT COUNT(*) c FROM topics WHERE user_id=?').get(u.id).c,likes,points,rank:rank(points),recent:db.prepare('SELECT id,title,created FROM topics WHERE user_id=? ORDER BY id DESC LIMIT 10').all(u.id)});
});
app.get('/api/users',(req,res)=>{
 const q='%'+String(req.query.q||'').replace(/[%_]/g,'')+'%';res.json(db.prepare('SELECT * FROM users WHERE name LIKE ? ORDER BY id LIMIT 100').all(q).map(u=>({...pub(u),perms:admin(req.user)?perms(u):undefined})));
});
app.get('/api/search',(req,res)=>{
 const q=String(req.query.q||'').trim().replace(/[%_]/g,'');if(q.length<2)return res.json([]);const l='%'+q+'%';
 res.json(db.prepare(`SELECT t.id,t.title,t.last_post,u.name,f.title ftitle FROM topics t JOIN users u ON u.id=t.user_id JOIN forums f ON f.id=t.forum_id WHERE t.title LIKE ? OR t.id IN(SELECT topic_id FROM posts WHERE body LIKE ?) ORDER BY t.last_post DESC LIMIT 50`).all(l,l));
});
app.get('/api/notifs',(req,res)=>{if(!req.user)return res.json([]);res.json(db.prepare('SELECT * FROM notifs WHERE user_id=? ORDER BY id DESC LIMIT 50').all(req.user.id))});
app.post('/api/notifs/read',(req,res)=>{if(req.user)db.prepare('UPDATE notifs SET read=1 WHERE user_id=?').run(req.user.id);res.json({ok:1})});

const adm=(req,res)=>{if(!need(req,res))return false;if(!admin(req.user)){err(res,'Только для администратора',403);return false}return true};
app.post('/api/admin/section',(req,res)=>{if(!adm(req,res))return;const t=String(req.body.title||'').trim();if(!t)return err(res,'Название?');db.prepare('INSERT INTO sections(title,icon,pos) VALUES(?,?,?)').run(t,req.body.icon==='crown'?'crown':'chat',+req.body.pos||99);res.json({ok:1})});
app.post('/api/admin/forum',(req,res)=>{if(!adm(req,res))return;const b=req.body,t=String(b.title||'').trim();if(!t)return err(res,'Название?');
 db.prepare('INSERT INTO forums(section_id,parent_id,title,descr,icon,link,staff_only,pos) VALUES(?,?,?,?,?,?,?,?)').run(+b.section_id,+b.parent_id||null,t,String(b.descr||''),b.link?(/t\.me|telegram/.test(b.link)?'tg':'ds'):'chat',cleanUrl(b.link),b.staff_only?1:0,+b.pos||99);if(b.is_apps)db.prepare('UPDATE forums SET is_apps=1 WHERE id=(SELECT MAX(id) FROM forums)').run();res.json({ok:1})});
app.delete('/api/admin/forum/:id',(req,res)=>{if(!adm(req,res))return;const id=+req.params.id;
 const ids=[id,...db.prepare('SELECT id FROM forums WHERE parent_id=?').all(id).map(x=>x.id)];
 ids.forEach(i=>{db.prepare('DELETE FROM posts WHERE topic_id IN(SELECT id FROM topics WHERE forum_id=?)').run(i);db.prepare('DELETE FROM topics WHERE forum_id=?').run(i);db.prepare('DELETE FROM forums WHERE id=?').run(i)});res.json({ok:1})});
app.delete('/api/admin/section/:id',(req,res)=>{if(!adm(req,res))return;if(db.prepare('SELECT 1 FROM forums WHERE section_id=?').get(+req.params.id))return err(res,'Сначала удалите разделы внутри');db.prepare('DELETE FROM sections WHERE id=?').run(+req.params.id);res.json({ok:1})});
app.put('/api/admin/user/:id',(req,res)=>{if(!adm(req,res))return;const id=+req.params.id,b=req.body,t=db.prepare('SELECT * FROM users WHERE id=?').get(id);
 if(!t)return err(res,'Нет пользователя',404);if(t.role==='admin')return err(res,'Главного администратора менять нельзя');
 const U=(c,v)=>db.prepare(`UPDATE users SET ${c}=? WHERE id=?`).run(v,id);
 if(b.role!==undefined){if(!['user','mod'].includes(b.role))return err(res,'Главный администратор может быть только один');U('role',b.role)}
 if(b.banned!==undefined)U('banned',b.banned?1:0);
 if(b.prefix!==undefined)U('prefix',String(b.prefix).trim().slice(0,30)||null);
 if(b.prefix_color!==undefined)U('prefix_color',hex(b.prefix_color));
 if(b.color!==undefined)U('color',hex(b.color));
 if(b.verified!==undefined)U('verified',b.verified?1:0);
 if(Array.isArray(b.perms))U('perms',JSON.stringify(b.perms.filter(p=>PERMS.includes(p))));
 res.json({ok:1})});
app.post('/api/admin/prefix',(req,res)=>{if(!adm(req,res))return;const t=String(req.body.text||'').trim().slice(0,24);if(!t)return err(res,'Название?');db.prepare('INSERT INTO prefixes(text,color,staff_only) VALUES(?,?,?)').run(t,hex(req.body.color)||'#2d8bff',req.body.staff_only?1:0);res.json({ok:1})});
app.delete('/api/admin/prefix/:id',(req,res)=>{if(!adm(req,res))return;db.prepare('UPDATE topics SET prefix_id=NULL WHERE prefix_id=?').run(+req.params.id);db.prepare('DELETE FROM prefixes WHERE id=?').run(+req.params.id);res.json({ok:1})});
app.put('/api/ban/:id',(req,res)=>{if(!need(req,res))return;if(!can(req.user,'ban'))return err(res,'Нет прав',403);const t=db.prepare('SELECT * FROM users WHERE id=?').get(+req.params.id);if(!t||t.role!=='user')return err(res,'Нельзя заблокировать этого пользователя');db.prepare('UPDATE users SET banned=? WHERE id=?').run(req.body.banned?1:0,t.id);res.json({ok:1})});
const lastC=new Map();
app.get('/api/chat',(req,res)=>{const rows=db.prepare('SELECT c.id,c.body,c.created,u.id uid,u.name,u.avatar,u.role,u.color,u.verified,u.prefix,u.prefix_color FROM chat c JOIN users u ON u.id=c.user_id WHERE c.id>? ORDER BY c.id DESC LIMIT 60').all(+req.query.after||0).reverse();
 res.json(rows.map(r=>({id:r.id,body:r.body,created:r.created,user:pub({id:r.uid,name:r.name,avatar:r.avatar,role:r.role,color:r.color,verified:r.verified,prefix:r.prefix,prefix_color:r.prefix_color})})))});
app.post('/api/chat',(req,res)=>{if(!need(req,res))return;const b=String(req.body.body||'').trim();if(!b||b.length>300)return err(res,'Сообщение: 1–300 символов');
 if(now()-(lastC.get(req.user.id)||0)<1200)return err(res,'Не так быстро',429);lastC.set(req.user.id,now());
 db.prepare('INSERT INTO chat(user_id,body,created) VALUES(?,?,?)').run(req.user.id,b,now());if(Math.random()<.02)db.prepare('DELETE FROM chat WHERE id<(SELECT MAX(id)-1000 FROM chat)').run();res.json({ok:1})});
app.delete('/api/chat/:id',(req,res)=>{if(!need(req,res))return;const c=db.prepare('SELECT * FROM chat WHERE id=?').get(+req.params.id);if(!c)return res.json({ok:1});if(c.user_id!==req.user.id&&!can(req.user,'chat'))return err(res,'Нет прав',403);db.prepare('DELETE FROM chat WHERE id=?').run(c.id);res.json({ok:1})});
app.put('/api/admin/rules',(req,res)=>{if(!adm(req,res))return;db.prepare("UPDATE settings SET v=? WHERE k='rules'").run(String(req.body.rules||'').slice(0,10000));res.json({ok:1})});
app.use(express.static(path.join(__dirname,'public')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
app.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Forum started'));
