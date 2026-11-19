'use strict';
const express=require('express'),Database=require('better-sqlite3'),crypto=require('crypto'),path=require('path'),fs=require('fs'),zlib=require('zlib');
const PKG=require('./package.json');

/* ================= ХРАНИЛИЩЕ (аккаунты НЕ должны пропадать) =================
   Порядок выбора папки с базой:
   1) DATA_DIR  2) RAILWAY_VOLUME_MOUNT_PATH (Railway сам ставит при подключённом Volume)
   3) /data, если такая папка существует (смонтированный Volume)  4) ./data (локальный запуск)  */
function pickDataDir(){
 if(process.env.DATA_DIR)return process.env.DATA_DIR;
 if(process.env.RAILWAY_VOLUME_MOUNT_PATH)return process.env.RAILWAY_VOLUME_MOUNT_PATH;
 try{if(fs.statSync('/data').isDirectory()){fs.accessSync('/data',fs.constants.W_OK);return'/data'}}catch(e){}
 return path.join(__dirname,'data');
}
const DATA=pickDataDir();fs.mkdirSync(DATA,{recursive:true});
const DBFILE=path.join(DATA,'forum.db');
// если база раньше лежала в ./data, а теперь папка другая — переносим, ничего не теряем
try{const old=path.join(__dirname,'data','forum.db');if(!fs.existsSync(DBFILE)&&old!==DBFILE&&fs.existsSync(old)){fs.copyFileSync(old,DBFILE);['-wal','-shm'].forEach(x=>{if(fs.existsSync(old+x))fs.copyFileSync(old+x,DBFILE+x)})}}catch(e){console.error('legacy copy failed',e.message)}
const IN_CLOUD=!!(process.env.RAILWAY_ENVIRONMENT||process.env.RAILWAY_PROJECT_ID||fs.existsSync('/.dockerenv'));
let PERSIST=true;
try{PERSIST=fs.statSync(DATA).dev!==fs.statSync(__dirname).dev||!path.resolve(DATA).startsWith(path.resolve(__dirname)+path.sep)}catch(e){}
const STORAGE_WARN=IN_CLOUD&&!PERSIST; // в облаке база лежит внутри контейнера => при каждом деплое будет стираться

const db=new Database(DBFILE);db.pragma('journal_mode=WAL');db.pragma('synchronous=NORMAL');db.pragma('foreign_keys=ON');db.pragma('temp_store=MEMORY');db.pragma('cache_size=-16000');
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
CREATE TABLE IF NOT EXISTS prefixes(id INTEGER PRIMARY KEY,text TEXT,color TEXT,staff_only INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS chat(id INTEGER PRIMARY KEY,user_id INTEGER,body TEXT,created INTEGER);
`);
// Миграции только ДОБАВЛЯЮТ колонки/индексы — старые данные никогда не трогаются
const addCol=(t,c,d)=>{try{db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${d}`)}catch(e){}};
addCol('users','verified','INTEGER DEFAULT 0');addCol('users','color','TEXT');addCol('users','prefix','TEXT');addCol('users','prefix_color','TEXT');addCol('users','perms',"TEXT DEFAULT '[]'");
addCol('topics','prefix_id','INTEGER');addCol('topics','status','TEXT');addCol('topics','status_by','INTEGER');addCol('topics','status_at','INTEGER');
addCol('forums','is_apps','INTEGER DEFAULT 0');addCol('likes','emoji',"TEXT DEFAULT '👍'");
addCol('users','badge_color','TEXT');
db.exec(`CREATE INDEX IF NOT EXISTS i_t ON topics(forum_id,pinned,last_post);CREATE INDEX IF NOT EXISTS i_p ON posts(topic_id,id);
CREATE INDEX IF NOT EXISTS i_pu ON posts(user_id);CREATE INDEX IF NOT EXISTS i_tu ON topics(user_id);CREATE INDEX IF NOT EXISTS i_lp ON likes(post_id);
CREATE INDEX IF NOT EXISTS i_nu ON notifs(user_id,read);CREATE INDEX IF NOT EXISTS i_su ON sessions(user_id);CREATE INDEX IF NOT EXISTS i_lu ON users(last_seen);`);
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
if(!db.prepare("SELECT 1 FROM settings WHERE k='rules'").get())db.prepare("INSERT INTO settings VALUES('rules',?)").run('Правила форума.');
if(!db.prepare('SELECT 1 FROM prefixes').get()){const P=db.prepare('INSERT INTO prefixes(text,color,staff_only) VALUES(?,?,?)');P.run('Важно','#e5173f',1);P.run('Информация','#e0456b',0);P.run('Опрос','#d4b300',0);P.run('Баг','#e8761a',0);P.run('Предложение','#20b486',0);P.run('Заявка','#2d8bff',0)}
if(!db.prepare("SELECT 1 FROM settings WHERE k='apps_init'").get()){db.prepare("UPDATE forums SET is_apps=1 WHERE title IN('Жалобы','Приемная руководства проекта')").run();db.prepare("INSERT INTO settings VALUES('apps_init','1')").run()}

/* ================= РЕЗЕРВНЫЕ КОПИИ ================= */
const BK=path.join(DATA,'backups'),TMP=path.join(DATA,'tmp');fs.mkdirSync(BK,{recursive:true});fs.mkdirSync(TMP,{recursive:true});
const sqlq=s=>"'"+String(s).replace(/'/g,"''")+"'";
function prune(tag,keep){try{const fl=fs.readdirSync(BK).filter(x=>x.startsWith(tag+'-')&&x.endsWith('.db')).sort();fl.slice(0,Math.max(0,fl.length-keep)).forEach(x=>fs.unlinkSync(path.join(BK,x)))}catch(e){}}
function backup(tag,keep=8){
 try{const f=path.join(BK,`${tag}-${new Date().toISOString().replace(/[:.]/g,'-')}.db`);db.exec(`VACUUM INTO ${sqlq(f)}`);prune(tag,keep);return path.basename(f)}
 catch(e){console.error('backup failed:',e.message);return null}
}
const usersCount=()=>db.prepare('SELECT COUNT(*) c FROM users').get().c;
const TABLES=['users','sections','forums','topics','posts','likes','notifs','settings','prefixes','chat'];
function restoreFrom(file){
 const fd=fs.openSync(file,'r'),hd=Buffer.alloc(16);fs.readSync(fd,hd,0,16,0);fs.closeSync(fd);
 if(hd.toString('latin1',0,15)!=='SQLite format 3')throw new Error('Это не файл базы форума');
 backup('pre-restore',5);
 db.exec(`ATTACH DATABASE ${sqlq(file)} AS bk`);
 try{
  const has=n=>!!db.prepare("SELECT 1 FROM bk.sqlite_master WHERE type='table' AND name=?").get(n);
  if(!has('users'))throw new Error('В файле нет таблицы пользователей — это не база форума');
  const cols=(sch,t)=>db.prepare(`PRAGMA ${sch}.table_info(${t})`).all().map(r=>r.name);
  db.exec('BEGIN');
  try{
   const counts={};
   for(const t of TABLES){if(!has(t))continue;const c=cols('main',t).filter(x=>cols('bk',t).includes(x));if(!c.length)continue;
    db.exec(`DELETE FROM main.${t}`);db.exec(`INSERT INTO main.${t}(${c.join(',')}) SELECT ${c.join(',')} FROM bk.${t}`);counts[t]=db.prepare(`SELECT COUNT(*) c FROM main.${t}`).get().c}
   db.exec('DELETE FROM sessions WHERE user_id NOT IN(SELECT id FROM users)');
   db.exec('COMMIT');return counts;
  }catch(e){try{db.exec('ROLLBACK')}catch(x){}throw e}
 }finally{try{db.exec('DETACH DATABASE bk')}catch(e){}}
}
// версия форума сменилась (обновление) -> сначала страховочная копия, потом работаем
const PREV=(db.prepare("SELECT v FROM settings WHERE k='app_build'").get()||{}).v;
let VER={version:PKG.version,notes:[]};try{VER=JSON.parse(fs.readFileSync(path.join(__dirname,'version.json'),'utf8'))}catch(e){}
if(usersCount()>0)backup(PREV!==String(VER.version)?'pre-update':'boot',6);
db.prepare("INSERT INTO settings(k,v) VALUES('app_build',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(String(VER.version));
setInterval(()=>{if(usersCount()>0)backup('auto',8)},6*3600*1000).unref();
for(const sig of['SIGTERM','SIGINT'])process.on(sig,()=>{try{db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.close()}catch(e){}process.exit(0)});

/* ================= СТАТИКА В ПАМЯТИ + ВЕРСИЯ СБОРКИ ================= */
const PUB=path.join(__dirname,'public');
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
const TEXT=new Set(['.html','.css','.js','.json','.svg','.webmanifest']);
const files=new Map();let BUILD='';
(function load(){
 const list=[];(function walk(d){for(const n of fs.readdirSync(d).sort()){const f=path.join(d,n);fs.statSync(f).isDirectory()?walk(f):list.push(f)}})(PUB);
 const h=crypto.createHash('sha1');h.update(String(VER.version));h.update(fs.readFileSync(__filename));
 const raw=list.map(f=>{const rel=path.relative(PUB,f).split(path.sep).join('/'),buf=fs.readFileSync(f);h.update(rel);h.update(buf);return{rel,buf}});
 BUILD=h.digest('hex').slice(0,10);
 for(const{rel,buf}of raw){const ext=path.extname(rel).toLowerCase();let b=buf;
  if(TEXT.has(ext))b=Buffer.from(buf.toString('utf8').replace(/__V__/g,BUILD));
  files.set('/'+rel,{buf:b,gz:TEXT.has(ext)&&b.length>600?zlib.gzipSync(b,{level:9}):null,type:MIME[ext]||'application/octet-stream',etag:'"'+crypto.createHash('sha1').update(b).digest('hex').slice(0,16)+'"'})}
})();
function serveStatic(req,res,next){
 if(req.method!=='GET'&&req.method!=='HEAD')return next();
 const url=req.url||'/';let p;try{p=decodeURIComponent(url.split('?')[0])}catch(e){p='/'}
 if(p==='/'||p==='')p='/index.html';
 let f=files.get(p);
 if(!f){if(p.startsWith('/api/')||path.extname(p)){res.statusCode=404;return res.end('Not found')}f=files.get('/index.html');p='/index.html'}
 const html=p==='/index.html';
 res.setHeader('Content-Type',f.type);res.setHeader('ETag',f.etag);res.setHeader('Vary','Accept-Encoding');
 res.setHeader('Cache-Control',html?'no-cache, must-revalidate':(/[?&]v=/.test(url)?'public, max-age=31536000, immutable':'public, max-age=300'));
 if(req.headers['if-none-match']===f.etag){res.statusCode=304;return res.end()}
 const gz=f.gz&&/\bgzip\b/.test(req.headers['accept-encoding']||'');if(gz)res.setHeader('Content-Encoding','gzip');
 const body=gz?f.gz:f.buf;res.setHeader('Content-Length',body.length);res.statusCode=200;res.end(req.method==='HEAD'?undefined:body);
}

/* ================= ПРИЛОЖЕНИЕ ================= */
const hash=(p,s)=>crypto.scryptSync(p,s,32).toString('hex');
const app=express();app.set('trust proxy',1);
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
 // JSON со сжатием gzip — быстрее на мобильном интернете
 res.json=function(o){const s=JSON.stringify(o);res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
  if(s.length>800&&/\bgzip\b/.test(req.headers['accept-encoding']||'')){zlib.gzip(s,(e,b)=>{if(e)return res.end(s);res.setHeader('Content-Encoding','gzip');res.setHeader('Vary','Accept-Encoding');res.end(b)})}else res.end(s);return res};
 next()});
app.use(express.json({limit:'200kb'}));
const cookie=(req,n)=>((req.headers.cookie||'').split(/;\s*/).find(c=>c.startsWith(n+'='))||'').slice(n.length+1);
const guests=new Map();
const stmts=new Map();const q=sql=>{let s=stmts.get(sql);if(!s){s=db.prepare(sql);stmts.set(sql,s)}return s};
app.use((req,res,next)=>{
 if(!req.path.startsWith('/api'))return next();
 const tk=cookie(req,'sid');req.user=null;
 if(tk){const u=q('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?').get(tk);if(u){req.user=u;if(now()-(u.last_seen||0)>60000)q('UPDATE users SET last_seen=? WHERE id=?').run(now(),u.id)}}
 if(!req.user)guests.set(req.ip+(req.headers['user-agent']||''),now());
 next();
});
const memo=new Map();const cached=(k,ttl,fn)=>{const m=memo.get(k),t=Date.now();if(m&&t-m.t<ttl)return m.v;const v=fn();memo.set(k,{t,v});return v};const bust=()=>memo.clear();
const err=(res,m,c=400)=>res.status(c).json({error:m});
const staff=u=>u&&(u.role==='admin'||u.role==='mod'),admin=u=>u&&u.role==='admin';
const perms=u=>{try{return JSON.parse(u.perms||'[]')}catch(e){return[]}};
const PANEL=['panel_topic','panel_forums','panel_prefixes','panel_rules','panel_users'];
const PERMS=['pin','lock','move','delete_topic','delete_post','edit_post','ban','status','topic_prefix','chat','staff_forum',...PANEL];
const can=(u,p)=>!!u&&!u.banned&&(u.role==='admin'||(u.role==='mod'&&perms(u).includes(p)));
const hasPanel=u=>!!u&&!u.banned&&(u.role==='admin'||(u.role==='mod'&&perms(u).some(p=>PANEL.includes(p))));
const hex=c=>/^#[0-9a-fA-F]{6}$/.test(c||'')?c:null;
const rank=p=>p<10?'Новичок':p<50?'Активный':p<150?'Опытный':p<500?'Ветеран':'Легенда';
const ST=['review','approved','rejected','checked'],STL={review:'На рассмотрении',approved:'Одобрено',rejected:'Отказано',checked:'Проверено'},EMO=['👍','❤️','🔥','😂','😮','😢'];
const need=(req,res)=>{if(!req.user){err(res,'Войдите в аккаунт',401);return false}if(req.user.banned){err(res,'Ваш аккаунт заблокирован',403);return false}return true};
const gate=perm=>(req,res)=>{if(!need(req,res))return false;if(!can(req.user,perm)){err(res,'Нет доступа к этой функции — его выдаёт главный администратор',403);return false}return true};
const lastW=new Map();const slow=(req,res)=>{const k=req.user.id,t=lastW.get(k)||0;if(now()-t<3000&&!staff(req.user)){err(res,'Слишком часто. Подождите пару секунд',429);return true}lastW.set(k,now());return false};
const RP={admin:'Главный администратор',mod:'Модератор'},RC={admin:'#e5173f',mod:'#f59e0b'};
const pub=u=>u&&{id:u.id,name:u.name,role:u.role,prefix:u.prefix||RP[u.role]||null,pcolor:u.prefix_color||RC[u.role]||'#2d8bff',color:u.color||null,verified:!!u.verified,bcolor:u.badge_color||null,avatar:u.avatar,about:u.about,banned:u.banned,created:u.created,last_seen:u.last_seen};
const cleanUrl=s=>/^https?:\/\/\S{1,300}$/.test(s||'')?s:null;
const notify=(uid,text,link)=>q('INSERT INTO notifs(user_id,text,link,created) VALUES(?,?,?,?)').run(uid,text,link,now());
const isHttps=req=>req.headers['x-forwarded-proto']==='https'||(req.socket&&req.socket.encrypted);

app.get('/api/version',(req,res)=>res.json({v:BUILD,version:VER.version,notes:VER.notes||[]}));

app.post('/api/register',(req,res)=>{
 const n=String(req.body.name||'').trim(),p=String(req.body.pass||'');
 if(!/^[A-Za-z0-9_А-Яа-яЁё]{3,20}$/.test(n))return err(res,'Ник: 3–20 символов, буквы, цифры, _');
 if(p.length<6)return err(res,'Пароль минимум 6 символов');
 if(q('SELECT 1 FROM users WHERE name=?').get(n))return err(res,'Ник уже занят');
 const first=!q('SELECT 1 FROM users').get(),salt=crypto.randomBytes(16).toString('hex');
 const id=q('INSERT INTO users(name,pass,salt,role,created,last_seen) VALUES(?,?,?,?,?,?)').run(n,hash(p,salt),salt,first?'admin':'user',now(),now()).lastInsertRowid;
 login(req,res,id);bust();res.json({ok:1});
});
function login(req,res,id){const t=crypto.randomBytes(32).toString('hex');q('INSERT INTO sessions VALUES(?,?,?)').run(t,id,now());
 res.setHeader('Set-Cookie',`sid=${t}; HttpOnly; Path=/; Max-Age=31536000; SameSite=Lax${isHttps(req)?'; Secure':''}`)}
app.post('/api/login',(req,res)=>{
 const u=q('SELECT * FROM users WHERE name=?').get(String(req.body.name||'').trim());
 if(!u||hash(String(req.body.pass||''),u.salt)!==u.pass)return err(res,'Неверный ник или пароль');
 login(req,res,u.id);res.json({ok:1});
});
app.post('/api/logout',(req,res)=>{const t=cookie(req,'sid');q('DELETE FROM sessions WHERE token=?').run(t);res.setHeader('Set-Cookie','sid=; Path=/; Max-Age=0');res.json({ok:1})});
app.get('/api/me',(req,res)=>{
 const u=req.user;res.json({user:u&&{...pub(u),perms:perms(u),panel:hasPanel(u)},unread:u?q('SELECT COUNT(*) c FROM notifs WHERE user_id=? AND read=0').get(u.id).c:0,rules:q("SELECT v FROM settings WHERE k='rules'").get().v,reportForum:(q("SELECT id FROM forums WHERE title='Жалобы'").get()||{}).id,build:BUILD});
});
app.put('/api/me',(req,res)=>{
 if(!need(req,res))return;const av=req.body.avatar?cleanUrl(req.body.avatar):null;
 q('UPDATE users SET about=?,avatar=? WHERE id=?').run(String(req.body.about||'').slice(0,500),av,req.user.id);bust();res.json({ok:1});
});
app.post('/api/password',(req,res)=>{
 if(!need(req,res))return;const u=req.user;
 if(hash(String(req.body.old||''),u.salt)!==u.pass)return err(res,'Старый пароль неверный');
 if(String(req.body.pass||'').length<6)return err(res,'Пароль минимум 6 символов');
 const s=crypto.randomBytes(16).toString('hex');q('UPDATE users SET pass=?,salt=? WHERE id=?').run(hash(String(req.body.pass),s),s,u.id);res.json({ok:1});
});

app.get('/api/index',(req,res)=>{
 const base=cached('index',3000,()=>{
  const secs=q('SELECT * FROM sections ORDER BY pos,id').all(),fs_=q('SELECT * FROM forums ORDER BY pos,id').all();
  const T={},P={},L={};
  q('SELECT forum_id f,COUNT(*) c FROM topics GROUP BY forum_id').all().forEach(r=>T[r.f]=r.c);
  q('SELECT t.forum_id f,COUNT(*) c FROM posts p JOIN topics t ON t.id=p.topic_id GROUP BY t.forum_id').all().forEach(r=>P[r.f]=r.c);
  q(`SELECT * FROM(SELECT t.forum_id f,t.id,t.title,t.last_post,u.name,ROW_NUMBER() OVER(PARTITION BY t.forum_id ORDER BY t.last_post DESC) rn FROM topics t JOIN users u ON u.id=t.user_id) WHERE rn=1`).all().forEach(r=>L[r.f]={id:r.id,title:r.title,last_post:r.last_post,name:r.name});
  const forums=fs_.map(f=>{const kids=fs_.filter(k=>k.parent_id===f.id),ids=[f.id,...kids.map(k=>k.id)];let t=0,p=0,l=null;
   ids.forEach(i=>{t+=T[i]||0;p+=P[i]||0;const x=L[i];if(x&&(!l||x.last_post>l.last_post))l=x});
   return{...f,topics:t,posts:p,last:l,kids:kids.map(k=>({id:k.id,title:k.title}))}}).filter(f=>!f.parent_id);
  const recent=q('SELECT p.id,p.body,p.created,t.id tid,t.title,u.id uid,u.name,u.avatar FROM posts p JOIN topics t ON t.id=p.topic_id JOIN users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT 5').all().map(r=>({...r,body:r.body.slice(0,60)}));
  const st={topics:q('SELECT COUNT(*) c FROM topics').get().c,posts:q('SELECT COUNT(*) c FROM posts').get().c,users:q('SELECT COUNT(*) c FROM users').get().c,newest:q('SELECT id,name FROM users ORDER BY id DESC LIMIT 1').get()};
  const top=q(`SELECT u.*,COALESCE(pc.c,0)+2*COALESCE(lc.c,0) pts FROM users u LEFT JOIN(SELECT user_id,COUNT(*) c FROM posts GROUP BY user_id) pc ON pc.user_id=u.id LEFT JOIN(SELECT p.user_id,COUNT(*) c FROM likes l JOIN posts p ON p.id=l.post_id GROUP BY p.user_id) lc ON lc.user_id=u.id ORDER BY pts DESC,u.id LIMIT 5`).all().map(u=>({...pub(u),pts:u.pts,rank:rank(u.pts)}));
  const online=q('SELECT * FROM users WHERE last_seen>? ORDER BY role,name').all(now()-300000).map(pub);
  const on=now()-300000;for(const[k,v]of guests)if(v<on)guests.delete(k);
  return{top,sections:secs,forums,team:online.filter(u=>u.role!=='user'),online,guests:guests.size,recent,stats:st};
 });
 res.json(base);
});
const PT=20,PP=15;
const canStaffForum=u=>can(u,'staff_forum')||can(u,'panel_topic');
app.get('/api/forum/:id',(req,res)=>{
 const f=q('SELECT * FROM forums WHERE id=?').get(req.params.id);if(!f)return err(res,'Раздел не найден',404);
 const page=Math.max(1,+req.query.page||1),total=q('SELECT COUNT(*) c FROM topics WHERE forum_id=?').get(f.id).c;
 const topics=q(`SELECT t.*,u.name,(SELECT COUNT(*)-1 FROM posts WHERE topic_id=t.id) replies,(SELECT u2.name FROM posts p JOIN users u2 ON u2.id=p.user_id WHERE p.topic_id=t.id ORDER BY p.id DESC LIMIT 1) last_name,pr.text ptext,pr.color pcol FROM topics t JOIN users u ON u.id=t.user_id LEFT JOIN prefixes pr ON pr.id=t.prefix_id WHERE t.forum_id=? ORDER BY t.pinned DESC,t.last_post DESC LIMIT ? OFFSET ?`).all(f.id,PT,(page-1)*PT);
 res.json({forum:f,parent:f.parent_id?q('SELECT id,title FROM forums WHERE id=?').get(f.parent_id):null,kids:q('SELECT * FROM forums WHERE parent_id=? ORDER BY pos').all(f.id),topics,page,pages:Math.ceil(total/PT)||1,canPost:!!req.user&&!req.user.banned&&!f.link&&(!f.staff_only||canStaffForum(req.user))});
});
app.post('/api/topic',(req,res)=>{
 if(!need(req,res)||slow(req,res))return;
 const f=q('SELECT * FROM forums WHERE id=?').get(+req.body.forum_id||0),title=String(req.body.title||'').trim(),body=String(req.body.body||'').trim();
 if(!f||f.link)return err(res,'Раздел недоступен');if(f.staff_only&&!canStaffForum(req.user))return err(res,'Здесь создавать темы может только персонал',403);
 if(title.length<3||title.length>120)return err(res,'Заголовок: 3–120 символов');if(body.length<2||body.length>20000)return err(res,'Сообщение слишком короткое или длинное');
 let pid=null;if(req.body.prefix_id){const pr=q('SELECT * FROM prefixes WHERE id=?').get(+req.body.prefix_id);if(pr&&(!pr.staff_only||can(req.user,'topic_prefix')||can(req.user,'panel_topic')))pid=pr.id}
 const t=now(),id=q('INSERT INTO topics(forum_id,user_id,title,created,last_post,prefix_id,status) VALUES(?,?,?,?,?,?,?)').run(f.id,req.user.id,title,t,t,pid,f.is_apps?'review':null).lastInsertRowid;
 q('INSERT INTO posts(topic_id,user_id,body,created) VALUES(?,?,?,?)').run(id,req.user.id,body,t);
 if(req.body.pinned&&can(req.user,'pin'))q('UPDATE topics SET pinned=1 WHERE id=?').run(id);
 if(req.body.locked&&can(req.user,'lock'))q('UPDATE topics SET locked=1 WHERE id=?').run(id);
 bust();res.json({id});
});
app.get('/api/prefixes',(req,res)=>res.json(q('SELECT * FROM prefixes ORDER BY id').all()));
app.get('/api/topic/:id',(req,res)=>{
 const t=q('SELECT t.*,u.name,pr.text ptext,pr.color pcol FROM topics t JOIN users u ON u.id=t.user_id LEFT JOIN prefixes pr ON pr.id=t.prefix_id WHERE t.id=?').get(req.params.id);if(!t)return err(res,'Тема не найдена',404);
 q('UPDATE topics SET views=views+1 WHERE id=?').run(t.id);
 const page=Math.max(1,+req.query.page||1),total=q('SELECT COUNT(*) c FROM posts WHERE topic_id=?').get(t.id).c,me=req.user?req.user.id:0;
 const posts=q(`SELECT p.*,u.name,u.avatar,u.role,u.color,u.verified,u.badge_color,u.prefix,u.prefix_color,u.banned,(SELECT COUNT(*) FROM posts WHERE user_id=u.id) ucount FROM posts p JOIN users u ON u.id=p.user_id WHERE p.topic_id=? ORDER BY p.id LIMIT ? OFFSET ?`).all(t.id,PP,(page-1)*PP).map(p=>({...p,prefix:p.prefix||RP[p.role]||null,pcolor:p.prefix_color||RC[p.role]||'#2d8bff',verified:!!p.verified,bcolor:p.badge_color||null}));
 const rx=q('SELECT emoji,COUNT(*) c,SUM(user_id=?) mine FROM likes WHERE post_id=? GROUP BY emoji');posts.forEach(p=>p.reactions=rx.all(me,p.id));
 const f=q('SELECT id,title,parent_id FROM forums WHERE id=?').get(t.forum_id),checker=t.status_by?pub(q('SELECT * FROM users WHERE id=?').get(t.status_by)):null;
 res.json({topic:t,forum:f,posts,page,pages:Math.ceil(total/PP)||1,checker,prefixes:q('SELECT * FROM prefixes ORDER BY id').all()});
});
app.post('/api/post',(req,res)=>{
 if(!need(req,res)||slow(req,res))return;
 const t=q('SELECT * FROM topics WHERE id=?').get(+req.body.topic_id||0),body=String(req.body.body||'').trim();
 if(!t)return err(res,'Тема не найдена',404);if(t.locked&&!can(req.user,'lock'))return err(res,'Тема закрыта',403);if(body.length<1||body.length>20000)return err(res,'Сообщение пустое или слишком длинное');
 const id=q('INSERT INTO posts(topic_id,user_id,body,created) VALUES(?,?,?,?)').run(t.id,req.user.id,body,now()).lastInsertRowid;
 q('UPDATE topics SET last_post=? WHERE id=?').run(now(),t.id);
 if(t.user_id!==req.user.id)notify(t.user_id,`${req.user.name} ответил в теме «${t.title}»`,`#/topic/${t.id}`);
 const total=q('SELECT COUNT(*) c FROM posts WHERE topic_id=?').get(t.id).c;bust();res.json({id,page:Math.ceil(total/PP)});
});
app.put('/api/post/:id',(req,res)=>{
 if(!need(req,res))return;const p=q('SELECT * FROM posts WHERE id=?').get(req.params.id);if(!p)return err(res,'Нет сообщения',404);
 if(p.user_id!==req.user.id&&!can(req.user,'edit_post'))return err(res,'Нет прав',403);const b=String(req.body.body||'').trim();if(!b)return err(res,'Пусто');
 q('UPDATE posts SET body=?,edited=? WHERE id=?').run(b.slice(0,20000),now(),p.id);bust();res.json({ok:1});
});
app.delete('/api/post/:id',(req,res)=>{
 if(!need(req,res))return;const p=q('SELECT * FROM posts WHERE id=?').get(req.params.id);if(!p)return err(res,'Нет сообщения',404);
 if(p.user_id!==req.user.id&&!can(req.user,'delete_post'))return err(res,'Нет прав',403);
 const first=q('SELECT id FROM posts WHERE topic_id=? ORDER BY id LIMIT 1').get(p.topic_id).id===p.id;
 if(first&&p.user_id!==req.user.id&&!can(req.user,'delete_topic'))return err(res,'Нет прав',403);
 bust();
 if(first){q('DELETE FROM posts WHERE topic_id=?').run(p.topic_id);q('DELETE FROM topics WHERE id=?').run(p.topic_id);return res.json({topicDeleted:1})}
 q('DELETE FROM posts WHERE id=?').run(p.id);res.json({ok:1});
});
app.post('/api/like/:id',(req,res)=>{
 if(!need(req,res))return;const p=q('SELECT * FROM posts WHERE id=?').get(req.params.id);if(!p)return err(res,'Нет сообщения',404);
 const em=EMO.includes(req.body.emoji)?req.body.emoji:'👍',e=q('SELECT emoji FROM likes WHERE post_id=? AND user_id=?').get(p.id,req.user.id);
 if(e&&e.emoji===em)q('DELETE FROM likes WHERE post_id=? AND user_id=?').run(p.id,req.user.id);
 else{q('INSERT OR REPLACE INTO likes(post_id,user_id,emoji) VALUES(?,?,?)').run(p.id,req.user.id,em);if(!e&&p.user_id!==req.user.id)notify(p.user_id,`${req.user.name} отреагировал ${em} на ваше сообщение`,`#/topic/${p.topic_id}`)}
 bust();res.json({ok:1});
});
app.post('/api/topic/:id/mod',(req,res)=>{
 if(!need(req,res))return;const id=+req.params.id,a=req.body.action,t=q('SELECT * FROM topics WHERE id=?').get(id);if(!t)return err(res,'Тема не найдена',404);
 const pm={pin:'pin',lock:'lock',delete:'delete_topic',move:'move',status:'status',prefix:'topic_prefix'}[a];
 if(!pm||!can(req.user,pm))return err(res,'Нет прав на это действие',403);
 if(a==='pin')q('UPDATE topics SET pinned=1-pinned WHERE id=?').run(id);
 else if(a==='lock')q('UPDATE topics SET locked=1-locked WHERE id=?').run(id);
 else if(a==='delete'){q('DELETE FROM posts WHERE topic_id=?').run(id);q('DELETE FROM topics WHERE id=?').run(id)}
 else if(a==='move'){if(!q('SELECT 1 FROM forums WHERE id=? AND link IS NULL').get(+req.body.forum_id))return err(res,'Раздел не найден');q('UPDATE topics SET forum_id=? WHERE id=?').run(+req.body.forum_id,id)}
 else if(a==='prefix'){q('UPDATE topics SET prefix_id=? WHERE id=?').run(+req.body.prefix_id||null,id)}
 else if(a==='status'){const st=req.body.status;if(st&&!ST.includes(st))return err(res,'Неверный статус');
  q('UPDATE topics SET status=?,status_by=?,status_at=? WHERE id=?').run(st||null,st?req.user.id:null,st?now():null,id);
  if(st&&t.user_id!==req.user.id)notify(t.user_id,`Ваша заявка «${t.title}»: ${STL[st]} (${req.user.name})`,`#/topic/${id}`)}
 bust();res.json({ok:1});
});
app.get('/api/user/:id',(req,res)=>{
 const u=q('SELECT * FROM users WHERE id=?').get(req.params.id);if(!u)return err(res,'Пользователь не найден',404);
 const posts=q('SELECT COUNT(*) c FROM posts WHERE user_id=?').get(u.id).c,likes=q('SELECT COUNT(*) c FROM likes l JOIN posts p ON p.id=l.post_id WHERE p.user_id=?').get(u.id).c,points=posts+likes*2;
 res.json({user:pub(u),posts,topics:q('SELECT COUNT(*) c FROM topics WHERE user_id=?').get(u.id).c,likes,points,rank:rank(points),recent:q('SELECT id,title,created FROM topics WHERE user_id=? ORDER BY id DESC LIMIT 10').all(u.id)});
});
app.get('/api/users',(req,res)=>{
 const qq='%'+String(req.query.q||'').replace(/[%_]/g,'')+'%';res.json(q('SELECT * FROM users WHERE name LIKE ? ORDER BY id LIMIT 100').all(qq).map(u=>({...pub(u),perms:admin(req.user)?perms(u):undefined})));
});
app.get('/api/search',(req,res)=>{
 const s=String(req.query.q||'').trim().replace(/[%_]/g,'');if(s.length<2)return res.json([]);const l='%'+s+'%';
 res.json(q(`SELECT t.id,t.title,t.last_post,u.name,f.title ftitle FROM topics t JOIN users u ON u.id=t.user_id JOIN forums f ON f.id=t.forum_id WHERE t.title LIKE ? OR t.id IN(SELECT topic_id FROM posts WHERE body LIKE ?) ORDER BY t.last_post DESC LIMIT 50`).all(l,l));
});
app.get('/api/notifs',(req,res)=>{if(!req.user)return res.json([]);res.json(q('SELECT * FROM notifs WHERE user_id=? ORDER BY id DESC LIMIT 50').all(req.user.id))});
app.post('/api/notifs/read',(req,res)=>{if(req.user)q('UPDATE notifs SET read=1 WHERE user_id=?').run(req.user.id);res.json({ok:1})});

/* ---------- Панель: права проверяются по отдельным доступам ---------- */
const adm=(req,res)=>{if(!need(req,res))return false;if(!admin(req.user)){err(res,'Только для главного администратора',403);return false}return true};
const gSections=gate('panel_forums'),gPrefix=gate('panel_prefixes'),gRules=gate('panel_rules');
app.post('/api/admin/section',(req,res)=>{if(!gSections(req,res))return;const t=String(req.body.title||'').trim();if(!t)return err(res,'Название?');q('INSERT INTO sections(title,icon,pos) VALUES(?,?,?)').run(t.slice(0,80),req.body.icon==='crown'?'crown':'chat',+req.body.pos||99);bust();res.json({ok:1})});
app.post('/api/admin/forum',(req,res)=>{if(!gSections(req,res))return;const b=req.body,t=String(b.title||'').trim();if(!t)return err(res,'Название?');
 if(!q('SELECT 1 FROM sections WHERE id=?').get(+b.section_id||0))return err(res,'Выберите раздел');
 const id=q('INSERT INTO forums(section_id,parent_id,title,descr,icon,link,staff_only,pos,is_apps) VALUES(?,?,?,?,?,?,?,?,?)').run(+b.section_id,+b.parent_id||null,t.slice(0,80),String(b.descr||'').slice(0,200),b.link?(/t\.me|telegram/.test(b.link)?'tg':'ds'):'chat',cleanUrl(b.link),b.staff_only?1:0,+b.pos||99,b.is_apps?1:0).lastInsertRowid;bust();res.json({ok:1,id})});
app.delete('/api/admin/forum/:id',(req,res)=>{if(!gSections(req,res))return;const id=+req.params.id;
 const ids=[id,...q('SELECT id FROM forums WHERE parent_id=?').all(id).map(x=>x.id)];
 ids.forEach(i=>{q('DELETE FROM posts WHERE topic_id IN(SELECT id FROM topics WHERE forum_id=?)').run(i);q('DELETE FROM topics WHERE forum_id=?').run(i);q('DELETE FROM forums WHERE id=?').run(i)});bust();res.json({ok:1})});
app.delete('/api/admin/section/:id',(req,res)=>{if(!gSections(req,res))return;if(q('SELECT 1 FROM forums WHERE section_id=?').get(+req.params.id))return err(res,'Сначала удалите разделы внутри');q('DELETE FROM sections WHERE id=?').run(+req.params.id);bust();res.json({ok:1})});
app.put('/api/admin/user/:id',(req,res)=>{
 if(!need(req,res))return;const me=req.user,A=admin(me),id=+req.params.id,b=req.body,t=q('SELECT * FROM users WHERE id=?').get(id);
 if(!t)return err(res,'Нет пользователя',404);if(t.role==='admin')return err(res,'Главного администратора менять нельзя');
 if(!A&&!can(me,'panel_users'))return err(res,'Нет доступа к этой функции — его выдаёт главный администратор',403);
 if(!A&&(b.role!==undefined||Array.isArray(b.perms)))return err(res,'Роли и доступы выдаёт только главный администратор',403);
 if(b.role!==undefined&&!['user','mod'].includes(b.role))return err(res,'Главный администратор может быть только один');
 if(b.banned!==undefined&&!A&&(!can(me,'ban')||t.role!=='user'))return err(res,'Нет прав банить этого пользователя',403);
 const U=(c,v)=>q(`UPDATE users SET ${c}=? WHERE id=?`).run(v,id);
 if(b.role!==undefined)U('role',b.role);
 if(b.banned!==undefined)U('banned',b.banned?1:0);
 if(b.prefix!==undefined)U('prefix',String(b.prefix).trim().slice(0,30)||null);
 if(b.prefix_color!==undefined)U('prefix_color',hex(b.prefix_color));
 if(b.color!==undefined)U('color',hex(b.color));
 if(b.badge_color!==undefined)U('badge_color',hex(b.badge_color));
 if(b.verified!==undefined)U('verified',b.verified?1:0);
 if(Array.isArray(b.perms))U('perms',JSON.stringify(b.perms.filter(p=>PERMS.includes(p))));
 bust();res.json({ok:1});
});
app.post('/api/admin/prefix',(req,res)=>{if(!gPrefix(req,res))return;const t=String(req.body.text||'').trim().slice(0,24);if(!t)return err(res,'Название?');q('INSERT INTO prefixes(text,color,staff_only) VALUES(?,?,?)').run(t,hex(req.body.color)||'#2d8bff',req.body.staff_only?1:0);res.json({ok:1})});
app.delete('/api/admin/prefix/:id',(req,res)=>{if(!gPrefix(req,res))return;q('UPDATE topics SET prefix_id=NULL WHERE prefix_id=?').run(+req.params.id);q('DELETE FROM prefixes WHERE id=?').run(+req.params.id);res.json({ok:1})});
app.put('/api/admin/rules',(req,res)=>{if(!gRules(req,res))return;q("UPDATE settings SET v=? WHERE k='rules'").run(String(req.body.rules||'').slice(0,10000));res.json({ok:1})});
app.put('/api/ban/:id',(req,res)=>{if(!need(req,res))return;if(!can(req.user,'ban'))return err(res,'Нет прав',403);const t=q('SELECT * FROM users WHERE id=?').get(+req.params.id);if(!t||t.role!=='user')return err(res,'Нельзя заблокировать этого пользователя');q('UPDATE users SET banned=? WHERE id=?').run(req.body.banned?1:0,t.id);bust();res.json({ok:1})});

/* ---------- Хранилище и резервные копии (только главный админ) ---------- */
const bkList=()=>{try{return fs.readdirSync(BK).filter(x=>/^[\w.-]+\.db$/.test(x)).sort().reverse().map(n=>({name:n,size:fs.statSync(path.join(BK,n)).size,time:fs.statSync(path.join(BK,n)).mtimeMs}))}catch(e){return[]}};
app.get('/api/admin/storage',(req,res)=>{if(!adm(req,res))return;res.json({dir:DATA,persistent:!STORAGE_WARN,warn:STORAGE_WARN,users:usersCount(),backups:bkList(),build:BUILD,version:VER.version})});
app.post('/api/admin/backup-now',(req,res)=>{if(!adm(req,res))return;const n=backup('manual',10);if(!n)return err(res,'Не удалось создать копию',500);res.json({ok:1,name:n})});
app.get('/api/admin/backup',(req,res)=>{if(!adm(req,res))return;
 const f=path.join(TMP,`dl-${Date.now()}.db`);try{db.exec(`VACUUM INTO ${sqlq(f)}`)}catch(e){return err(res,'Не удалось создать копию',500)}
 res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Disposition',`attachment; filename="waip-forum-${new Date().toISOString().slice(0,10)}.db"`);res.setHeader('Content-Length',fs.statSync(f).size);
 const s=fs.createReadStream(f);s.pipe(res);const rm=()=>fs.unlink(f,()=>{});s.on('close',rm);res.on('close',rm)});
app.get('/api/admin/backups/:name',(req,res)=>{if(!adm(req,res))return;const n=req.params.name;if(!/^[\w.-]+\.db$/.test(n)||!fs.existsSync(path.join(BK,n)))return err(res,'Нет такой копии',404);
 res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Disposition',`attachment; filename="${n}"`);fs.createReadStream(path.join(BK,n)).pipe(res)});
app.post('/api/admin/restore-server',(req,res)=>{if(!adm(req,res))return;const n=String(req.body.name||'');if(!/^[\w.-]+\.db$/.test(n)||!fs.existsSync(path.join(BK,n)))return err(res,'Нет такой копии',404);
 try{const c=restoreFrom(path.join(BK,n));bust();res.json({ok:1,counts:c})}catch(e){err(res,e.message,400)}});
app.post('/api/admin/restore',(req,res)=>{if(!adm(req,res))return;
 const LIM=80*1024*1024;let size=0,bad=false;const f=path.join(TMP,`up-${Date.now()}.db`),ws=fs.createWriteStream(f);
 req.on('data',c=>{size+=c.length;if(size>LIM&&!bad){bad=true;req.unpipe&&req.unpipe();ws.destroy();fs.unlink(f,()=>{});err(res,'Файл слишком большой (макс. 80 МБ)',413)}else if(!bad)ws.write(c)});
 req.on('end',()=>{if(bad)return;ws.end(()=>{try{const c=restoreFrom(f);bust();res.json({ok:1,counts:c})}catch(e){err(res,e.message,400)}finally{fs.unlink(f,()=>{})}})});
 req.on('error',()=>{try{ws.destroy();fs.unlink(f,()=>{})}catch(e){}});
});

/* ---------- Чат ---------- */
const lastC=new Map();
app.get('/api/chat',(req,res)=>{const rows=q('SELECT c.id,c.body,c.created,u.id uid,u.name,u.avatar,u.role,u.color,u.verified,u.badge_color,u.prefix,u.prefix_color FROM chat c JOIN users u ON u.id=c.user_id WHERE c.id>? ORDER BY c.id DESC LIMIT 60').all(+req.query.after||0).reverse();
 res.json(rows.map(r=>({id:r.id,body:r.body,created:r.created,user:pub({id:r.uid,name:r.name,avatar:r.avatar,role:r.role,color:r.color,verified:r.verified,badge_color:r.badge_color,prefix:r.prefix,prefix_color:r.prefix_color})})))});
app.post('/api/chat',(req,res)=>{if(!need(req,res))return;const b=String(req.body.body||'').trim();if(!b||b.length>300)return err(res,'Сообщение: 1–300 символов');
 if(now()-(lastC.get(req.user.id)||0)<800)return err(res,'Не так быстро',429);lastC.set(req.user.id,now());
 const id=q('INSERT INTO chat(user_id,body,created) VALUES(?,?,?)').run(req.user.id,b,now()).lastInsertRowid;if(Math.random()<.02)q('DELETE FROM chat WHERE id<(SELECT MAX(id)-1000 FROM chat)').run();res.json({ok:1,id})});
app.delete('/api/chat/:id',(req,res)=>{if(!need(req,res))return;const c=q('SELECT * FROM chat WHERE id=?').get(+req.params.id);if(!c)return res.json({ok:1});if(c.user_id!==req.user.id&&!can(req.user,'chat'))return err(res,'Нет прав',403);q('DELETE FROM chat WHERE id=?').run(c.id);res.json({ok:1})});

app.use(serveStatic);
app.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log(`Forum started · build ${BUILD} · data: ${DATA}${STORAGE_WARN?' · WARNING: storage is not persistent!':''}`));
