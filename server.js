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
`);
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
const need=(req,res)=>{if(!req.user){err(res,'Войдите в аккаунт',401);return false}if(req.user.banned){err(res,'Ваш аккаунт заблокирован',403);return false}return true};
const lastW=new Map();const slow=(req,res)=>{const k=req.user.id,t=lastW.get(k)||0;if(now()-t<3000&&!staff(req.user)){err(res,'Слишком часто. Подождите пару секунд',429);return true}lastW.set(k,now());return false};
const ROLE={admin:'Главный администратор',mod:'Модератор',user:'Пользователь'};
const pub=u=>u&&{id:u.id,name:u.name,role:u.role,title:u.title||ROLE[u.role],avatar:u.avatar,about:u.about,banned:u.banned,created:u.created,last_seen:u.last_seen};
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
 const u=req.user;res.json({user:pub(u),unread:u?db.prepare('SELECT COUNT(*) c FROM notifs WHERE user_id=? AND read=0').get(u.id).c:0,rules:db.prepare("SELECT v FROM settings WHERE k='rules'").get().v,reportForum:(db.prepare("SELECT id FROM forums WHERE title='Жалобы'").get()||{}).id});
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
 res.json({sections:secs,forums,team:online.filter(u=>u.role!=='user'),online,guests:guests.size,recent,stats:st});
});
const PT=20,PP=15;
app.get('/api/forum/:id',(req,res)=>{
 const f=db.prepare('SELECT * FROM forums WHERE id=?').get(req.params.id);if(!f)return err(res,'Раздел не найден',404);
 const page=Math.max(1,+req.query.page||1),total=db.prepare('SELECT COUNT(*) c FROM topics WHERE forum_id=?').get(f.id).c;
 const topics=db.prepare(`SELECT t.*,u.name,(SELECT COUNT(*)-1 FROM posts WHERE topic_id=t.id) replies,(SELECT u2.name FROM posts p JOIN users u2 ON u2.id=p.user_id WHERE p.topic_id=t.id ORDER BY p.id DESC LIMIT 1) last_name FROM topics t JOIN users u ON u.id=t.user_id WHERE t.forum_id=? ORDER BY t.pinned DESC,t.last_post DESC LIMIT ? OFFSET ?`).all(f.id,PT,(page-1)*PT);
 res.json({forum:f,parent:f.parent_id?db.prepare('SELECT id,title FROM forums WHERE id=?').get(f.parent_id):null,kids:db.prepare('SELECT * FROM forums WHERE parent_id=? ORDER BY pos').all(f.id),topics,page,pages:Math.ceil(total/PT)||1,canPost:!!req.user&&!req.user.banned&&(!f.staff_only||staff(req.user))});
});
app.post('/api/topic',(req,res)=>{
 if(!need(req,res)||slow(req,res))return;
 const f=db.prepare('SELECT * FROM forums WHERE id=?').get(req.body.forum_id),title=String(req.body.title||'').trim(),body=String(req.body.body||'').trim();
 if(!f||f.link)return err(res,'Раздел недоступен');if(f.staff_only&&!staff(req.user))return err(res,'Здесь создавать темы может только персонал',403);
 if(title.length<3||title.length>120)return err(res,'Заголовок: 3–120 символов');if(body.length<2||body.length>20000)return err(res,'Сообщение слишком короткое или длинное');
 const t=now(),id=db.prepare('INSERT INTO topics(forum_id,user_id,title,created,last_post) VALUES(?,?,?,?,?)').run(f.id,req.user.id,title,t,t).lastInsertRowid;
 db.prepare('INSERT INTO posts(topic_id,user_id,body,created) VALUES(?,?,?,?)').run(id,req.user.id,body,t);res.json({id});
});
app.get('/api/topic/:id',(req,res)=>{
 const t=db.prepare('SELECT t.*,u.name FROM topics t JOIN users u ON u.id=t.user_id WHERE t.id=?').get(req.params.id);if(!t)return err(res,'Тема не найдена',404);
 db.prepare('UPDATE topics SET views=views+1 WHERE id=?').run(t.id);
 const page=Math.max(1,+req.query.page||1),total=db.prepare('SELECT COUNT(*) c FROM posts WHERE topic_id=?').get(t.id).c,me=req.user?req.user.id:0;
 const posts=db.prepare(`SELECT p.*,u.name,u.avatar,u.role,u.title utitle,u.created ucreated,u.banned,(SELECT COUNT(*) FROM posts WHERE user_id=u.id) ucount,(SELECT COUNT(*) FROM likes WHERE post_id=p.id) likes,(SELECT COUNT(*) FROM likes WHERE post_id=p.id AND user_id=?) liked FROM posts p JOIN users u ON u.id=p.user_id WHERE p.topic_id=? ORDER BY p.id LIMIT ? OFFSET ?`).all(me,t.id,PP,(page-1)*PP).map(p=>({...p,utitle:p.utitle||ROLE[p.role]}));
 const f=db.prepare('SELECT id,title,parent_id FROM forums WHERE id=?').get(t.forum_id);
 res.json({topic:t,forum:f,posts,page,pages:Math.ceil(total/PP)||1});
});
app.post('/api/post',(req,res)=>{
 if(!need(req,res)||slow(req,res))return;
 const t=db.prepare('SELECT * FROM topics WHERE id=?').get(req.body.topic_id),body=String(req.body.body||'').trim();
 if(!t)return err(res,'Тема не найдена',404);if(t.locked&&!staff(req.user))return err(res,'Тема закрыта',403);if(body.length<1||body.length>20000)return err(res,'Сообщение пустое или слишком длинное');
 const id=db.prepare('INSERT INTO posts(topic_id,user_id,body,created) VALUES(?,?,?,?)').run(t.id,req.user.id,body,now()).lastInsertRowid;
 db.prepare('UPDATE topics SET last_post=? WHERE id=?').run(now(),t.id);
 if(t.user_id!==req.user.id)notify(t.user_id,`${req.user.name} ответил в теме «${t.title}»`,`#/topic/${t.id}`);
 const total=db.prepare('SELECT COUNT(*) c FROM posts WHERE topic_id=?').get(t.id).c;res.json({id,page:Math.ceil(total/PP)});
});
app.put('/api/post/:id',(req,res)=>{
 if(!need(req,res))return;const p=db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);if(!p)return err(res,'Нет сообщения',404);
 if(p.user_id!==req.user.id&&!staff(req.user))return err(res,'Нет прав',403);const b=String(req.body.body||'').trim();if(!b)return err(res,'Пусто');
 db.prepare('UPDATE posts SET body=?,edited=? WHERE id=?').run(b.slice(0,20000),now(),p.id);res.json({ok:1});
});
app.delete('/api/post/:id',(req,res)=>{
 if(!need(req,res))return;const p=db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);if(!p)return err(res,'Нет сообщения',404);
 if(p.user_id!==req.user.id&&!staff(req.user))return err(res,'Нет прав',403);
 const first=db.prepare('SELECT id FROM posts WHERE topic_id=? ORDER BY id LIMIT 1').get(p.topic_id).id===p.id;
 if(first){db.prepare('DELETE FROM posts WHERE topic_id=?').run(p.topic_id);db.prepare('DELETE FROM topics WHERE id=?').run(p.topic_id);return res.json({topicDeleted:1})}
 db.prepare('DELETE FROM posts WHERE id=?').run(p.id);res.json({ok:1});
});
app.post('/api/like/:id',(req,res)=>{
 if(!need(req,res))return;const p=db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);if(!p)return err(res,'Нет сообщения',404);
 const e=db.prepare('SELECT 1 FROM likes WHERE post_id=? AND user_id=?').get(p.id,req.user.id);
 if(e)db.prepare('DELETE FROM likes WHERE post_id=? AND user_id=?').run(p.id,req.user.id);else{db.prepare('INSERT INTO likes VALUES(?,?)').run(p.id,req.user.id);if(p.user_id!==req.user.id)notify(p.user_id,`${req.user.name} оценил ваше сообщение`,`#/topic/${p.topic_id}`)}
 res.json({ok:1});
});
app.post('/api/topic/:id/mod',(req,res)=>{
 if(!need(req,res))return;if(!staff(req.user))return err(res,'Нет прав',403);const id=+req.params.id,a=req.body.action;
 if(a==='pin')db.prepare('UPDATE topics SET pinned=1-pinned WHERE id=?').run(id);
 else if(a==='lock')db.prepare('UPDATE topics SET locked=1-locked WHERE id=?').run(id);
 else if(a==='delete'){db.prepare('DELETE FROM posts WHERE topic_id=?').run(id);db.prepare('DELETE FROM topics WHERE id=?').run(id)}
 else if(a==='move'){if(!db.prepare('SELECT 1 FROM forums WHERE id=? AND link IS NULL').get(+req.body.forum_id))return err(res,'Раздел не найден');db.prepare('UPDATE topics SET forum_id=? WHERE id=?').run(+req.body.forum_id,id)}
 res.json({ok:1});
});
app.get('/api/user/:id',(req,res)=>{
 const u=db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);if(!u)return err(res,'Пользователь не найден',404);
 res.json({user:pub(u),posts:db.prepare('SELECT COUNT(*) c FROM posts WHERE user_id=?').get(u.id).c,topics:db.prepare('SELECT COUNT(*) c FROM topics WHERE user_id=?').get(u.id).c,likes:db.prepare('SELECT COUNT(*) c FROM likes l JOIN posts p ON p.id=l.post_id WHERE p.user_id=?').get(u.id).c,recent:db.prepare('SELECT id,title,created FROM topics WHERE user_id=? ORDER BY id DESC LIMIT 10').all(u.id)});
});
app.get('/api/users',(req,res)=>{
 const q='%'+String(req.query.q||'').replace(/[%_]/g,'')+'%';res.json(db.prepare('SELECT * FROM users WHERE name LIKE ? ORDER BY id LIMIT 100').all(q).map(pub));
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
 db.prepare('INSERT INTO forums(section_id,parent_id,title,descr,icon,link,staff_only,pos) VALUES(?,?,?,?,?,?,?,?)').run(+b.section_id,+b.parent_id||null,t,String(b.descr||''),b.link?(/t\.me|telegram/.test(b.link)?'tg':'ds'):'chat',cleanUrl(b.link),b.staff_only?1:0,+b.pos||99);res.json({ok:1})});
app.delete('/api/admin/forum/:id',(req,res)=>{if(!adm(req,res))return;const id=+req.params.id;
 const ids=[id,...db.prepare('SELECT id FROM forums WHERE parent_id=?').all(id).map(x=>x.id)];
 ids.forEach(i=>{db.prepare('DELETE FROM posts WHERE topic_id IN(SELECT id FROM topics WHERE forum_id=?)').run(i);db.prepare('DELETE FROM topics WHERE forum_id=?').run(i);db.prepare('DELETE FROM forums WHERE id=?').run(i)});res.json({ok:1})});
app.delete('/api/admin/section/:id',(req,res)=>{if(!adm(req,res))return;if(db.prepare('SELECT 1 FROM forums WHERE section_id=?').get(+req.params.id))return err(res,'Сначала удалите разделы внутри');db.prepare('DELETE FROM sections WHERE id=?').run(+req.params.id);res.json({ok:1})});
app.put('/api/admin/user/:id',(req,res)=>{if(!adm(req,res))return;const id=+req.params.id;if(id===req.user.id)return err(res,'Нельзя менять себя');const b=req.body;
 if(b.role&&['user','mod','admin'].includes(b.role))db.prepare('UPDATE users SET role=? WHERE id=?').run(b.role,id);
 if(b.banned!==undefined){db.prepare('UPDATE users SET banned=? WHERE id=?').run(b.banned?1:0,id)}
 if(b.title!==undefined)db.prepare('UPDATE users SET title=? WHERE id=?').run(String(b.title).slice(0,40)||null,id);res.json({ok:1})});
app.put('/api/admin/rules',(req,res)=>{if(!adm(req,res))return;db.prepare("UPDATE settings SET v=? WHERE k='rules'").run(String(req.body.rules||'').slice(0,10000));res.json({ok:1})});
app.use(express.static(path.join(__dirname,'public')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
app.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Forum started'));
