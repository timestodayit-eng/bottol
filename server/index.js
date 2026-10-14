import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {S3Client,CreateMultipartUploadCommand,UploadPartCommand,CompleteMultipartUploadCommand,AbortMultipartUploadCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
const app=express();app.disable('x-powered-by');app.use(helmet({contentSecurityPolicy:false}));app.use(express.json({limit:'200kb'}));
const PORT=Number(process.env.PORT||3000);
const mysqlReady=Boolean(process.env.DB_HOST&&process.env.DB_USER&&process.env.DB_NAME&&process.env.JWT_SECRET?.length>=32);
const pool=mysqlReady?mysql.createPool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME,waitForConnections:true,connectionLimit:8,timezone:'Z',dateStrings:true,ssl:process.env.DB_SSL==='true'?{rejectUnauthorized:true}:undefined}):null;
const bucket=process.env.R2_BUCKET;
const r2ok=Boolean(process.env.R2_ACCOUNT_ID&&process.env.R2_ACCESS_KEY_ID&&process.env.R2_SECRET_ACCESS_KEY&&bucket);
const s3=r2ok?new S3Client({region:'auto',endpoint:`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY}}):null;
const fail=(res,code,message)=>res.status(code).json({error:message});
const handler=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
async function rows(sql,params=[]){const [data]=await pool.execute(sql,params);return data}
function stamp(){return new Date().toISOString().slice(0,19).replace('T',' ')}
app.get('/api/health',handler(async(_req,res)=>{let database=false;if(pool){try{await rows('SELECT 1');database=true}catch{}}res.json({ok:true,configured:mysqlReady,database,storageConfigured:r2ok,metaConfigured:Boolean(process.env.META_ACCESS_TOKEN)})}));
// Self-managed admin-issued MySQL accounts; no public user registration.
app.post('/api/auth/login',handler(async(req,res)=>{
 if(!pool)return fail(res,503,'MySQL and JWT_SECRET are not configured');
 const {email,password}=req.body||{};
 if(typeof email!=='string'||typeof password!=='string'||password.length>1024)return fail(res,400,'Invalid credentials');
 const users=await rows('SELECT id,email,password_hash,role,active FROM staff WHERE email=? LIMIT 1',[email.trim().toLowerCase()]);
 // Identical outward failure for absent/disabled user/password.
 const user=users[0];const valid=user?await bcrypt.compare(password,user.password_hash):false;
 if(!user||!user.active||!valid)return fail(res,401,'Incorrect email or password');
 const token=jwt.sign({sub:user.id},process.env.JWT_SECRET,{algorithm:'HS256',expiresIn:'8h',issuer:'ci-ads-manager',audience:'ci-dashboard'});
 res.json({access_token:token,email:user.email,role:user.role,expires_in:28800});
}));
async function protectedRoute(req,res,next){try{
 if(!pool)return fail(res,503,'MySQL is not configured');
 const token=(req.headers.authorization||'').match(/^Bearer (.+)$/)?.[1];if(!token)return fail(res,401,'Sign in required');
 const verified=jwt.verify(token,process.env.JWT_SECRET,{algorithms:['HS256'],issuer:'ci-ads-manager',audience:'ci-dashboard'});
 const found=await rows('SELECT id,email,role,active FROM staff WHERE id=? LIMIT 1',[verified.sub]);
 if(!found.length||!found[0].active)return fail(res,403,'Account disabled or not approved');
 req.user=found[0];req.role=found[0].role;next();
 }catch(e){return fail(res,401,'Invalid or expired login session')}}
const manager=(req,res,next)=>['super_admin','ads_manager'].includes(req.role)?next():fail(res,403,'Manager permission required');
const admin=(req,res,next)=>req.role==='super_admin'?next():fail(res,403,'Administrator permission required');
app.use('/api',protectedRoute);
app.get('/api/me',(req,res)=>res.json({email:req.user.email,role:req.role,id:req.user.id}));
app.get('/api/accounts',handler(async(req,res)=>res.json({accounts:await rows('SELECT * FROM ad_accounts ORDER BY slot')})));
app.patch('/api/accounts/:id',manager,handler(async(req,res)=>{
 const allowed=['label','daily_budget','audience_note','phone','start_date','end_date','selected'];const updates=Object.entries(req.body||{}).filter(([k])=>allowed.includes(k));
 if(!updates.length)return fail(res,400,'No valid fields');
 const current=(await rows('SELECT * FROM ad_accounts WHERE id=?',[req.params.id]))[0];if(!current)return fail(res,404,'Account not found');
 const values={...current,...Object.fromEntries(updates)};
 if(!Number.isFinite(Number(values.daily_budget))||Number(values.daily_budget)<0||!/^\+?[0-9]{8,16}$/.test(String(values.phone).replace(/\s/g,''))||String(values.end_date)<String(values.start_date))return fail(res,400,'Invalid account configuration');
 await rows(`UPDATE ad_accounts SET ${updates.map(([k])=>`\`${k}\`=?`).join(',')} WHERE id=?`,[...updates.map(([,v])=>v),req.params.id]);
 res.json({account:(await rows('SELECT * FROM ad_accounts WHERE id=?',[req.params.id]))[0]});
}));
app.get('/api/videos',handler(async(req,res)=>res.json({videos:await rows('SELECT id,name,size_bytes,mime_type,status,created_at FROM videos ORDER BY created_at DESC')})));
app.post('/api/videos/start',manager,handler(async(req,res)=>{
 if(!s3)return fail(res,503,'R2 storage not configured');const {name,size,mime}=req.body||{};
 if(typeof name!=='string'||name.length>200||!Number.isInteger(size)||size<1||size>1073741824)return fail(res,400,'Maximum video size is 1 GiB');
 if(!['video/mp4','video/quicktime','video/webm'].includes(mime))return fail(res,400,'MP4, MOV or WebM only');
 const id=randomUUID(),key=`videos/${id}/${name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
 const upload=await s3.send(new CreateMultipartUploadCommand({Bucket:bucket,Key:key,ContentType:mime}));
 try{await rows('INSERT INTO videos(id,name,size_bytes,mime_type,object_key,upload_id,status,uploaded_by) VALUES(?,?,?,?,?,?,?,?)',[id,name,size,mime,key,upload.UploadId,'uploading',req.user.id])}
 catch(e){await s3.send(new AbortMultipartUploadCommand({Bucket:bucket,Key:key,UploadId:upload.UploadId})).catch(()=>{});throw e}
 res.json({id,uploadId:upload.UploadId,chunkSize:16*1024*1024});
}));
async function getUpload(id){return (await rows('SELECT * FROM videos WHERE id=? LIMIT 1',[id]))[0]}
app.post('/api/videos/:id/part-url',manager,handler(async(req,res)=>{
 if(!s3)return fail(res,503,'R2 not configured');const v=await getUpload(req.params.id);if(!v||v.status!=='uploading')return fail(res,404,'Upload not found');
 const partNumber=Number(req.body.partNumber);if(!Number.isInteger(partNumber)||partNumber<1||partNumber>10000)return fail(res,400,'Invalid part');
 const url=await getSignedUrl(s3,new UploadPartCommand({Bucket:bucket,Key:v.object_key,UploadId:v.upload_id,PartNumber:partNumber}),{expiresIn:900});res.json({url});
}));
app.post('/api/videos/:id/complete',manager,handler(async(req,res)=>{
 if(!s3)return fail(res,503,'R2 not configured');const v=await getUpload(req.params.id);if(!v||v.status!=='uploading')return fail(res,404,'Upload not found');
 const parts=req.body.parts;if(!Array.isArray(parts)||!parts.length||parts.length>10000||parts.some(p=>!Number.isInteger(p.PartNumber)||typeof p.ETag!=='string'))return fail(res,400,'Invalid parts');
 await s3.send(new CompleteMultipartUploadCommand({Bucket:bucket,Key:v.object_key,UploadId:v.upload_id,MultipartUpload:{Parts:parts.sort((a,b)=>a.PartNumber-b.PartNumber)}}));
 await rows('UPDATE videos SET status=?,upload_id=NULL WHERE id=?',['ready',v.id]);res.json({ok:true});
}));
app.post('/api/videos/:id/abort',manager,handler(async(req,res)=>{
 if(!s3)return fail(res,503,'R2 not configured');const v=await getUpload(req.params.id);if(!v||v.status!=='uploading')return fail(res,404,'Upload not found');
 await s3.send(new AbortMultipartUploadCommand({Bucket:bucket,Key:v.object_key,UploadId:v.upload_id}));await rows('UPDATE videos SET status=?,upload_id=NULL WHERE id=?',['aborted',v.id]);res.json({ok:true});
}));
app.get('/api/drafts',handler(async(req,res)=>{const drafts=await rows('SELECT * FROM campaign_drafts ORDER BY created_at DESC LIMIT 100');res.json({drafts:drafts.map(x=>({...x,items:typeof x.items==='string'?JSON.parse(x.items):x.items,special_ad_categories:typeof x.special_ad_categories==='string'?JSON.parse(x.special_ad_categories):x.special_ad_categories}))})}));
app.post('/api/drafts',manager,handler(async(req,res)=>{
 const {name,objective,video_id,caption,headline,items}=req.body||{};
 if(typeof name!=='string'||name.trim().length<3||name.length>160)return fail(res,400,'Campaign name required');
 if(!['OUTCOME_LEADS','OUTCOME_TRAFFIC','OUTCOME_ENGAGEMENT','OUTCOME_AWARENESS'].includes(objective))return fail(res,400,'Invalid objective');
 if(typeof caption!=='string'||!caption.trim()||caption.length>5000||typeof headline!=='string'||headline.length>255)return fail(res,400,'Invalid creative');
 if(!Array.isArray(items)||items.length<1||items.length>10)return fail(res,400,'Select 1–10 accounts');
 const ids=[...new Set(items.map(x=>x.account_id))];if(ids.length!==items.length)return fail(res,400,'Duplicate accounts');
 const known=await rows(`SELECT id FROM ad_accounts WHERE id IN (${ids.map(()=>'?').join(',')})`,ids);if(known.length!==ids.length)return fail(res,400,'Unknown account');
 const video=await getUpload(video_id);if(!video||video.status!=='ready')return fail(res,400,'Choose a completely uploaded video');
 for(const x of items){if(!Number.isFinite(Number(x.daily_budget))||Number(x.daily_budget)<1||typeof x.audience_note!=='string'||!/^\+?[0-9]{8,16}$/.test(String(x.phone||'').replace(/\s/g,''))||!/^\d{4}-\d{2}-\d{2}$/.test(x.start_date||'')||!/^\d{4}-\d{2}-\d{2}$/.test(x.end_date||'')||x.end_date<x.start_date)return fail(res,400,'Invalid account configuration')}
 const id=randomUUID();await rows('INSERT INTO campaign_drafts(id,name,objective,special_ad_categories,video_id,caption,headline,items,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)',[id,name.trim(),objective,JSON.stringify(['EMPLOYMENT']),video_id,caption,headline,JSON.stringify(items),'draft',req.user.id]);
 res.status(201).json({draft:{id,name,objective,items,status:'draft'}});
}));
app.get('/api/meta/status',handler(async(req,res)=>res.json({configured:Boolean(process.env.META_ACCESS_TOKEN),message:'Account discovery only. Real campaign publishing not implemented.'})));
app.post('/api/meta/sync-accounts',admin,handler(async(req,res)=>{
 const token=process.env.META_ACCESS_TOKEN,version=process.env.META_API_VERSION||'v25.0';if(!token)return fail(res,503,'META_ACCESS_TOKEN not set');
 if(!/^v\d+\.\d+$/.test(version))return fail(res,500,'Invalid API version');
 let url=`https://graph.facebook.com/${version}/me/adaccounts?fields=id,name,account_status,currency&limit=100`,pages=0;const accounts=[];
 while(url&&pages++<15){const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});const payload=await response.json();if(!response.ok)throw Error(payload.error?.message||'Meta connection failed');accounts.push(...(payload.data||[]));url=payload.paging?.next||null}
 res.json({discovered:accounts.map(a=>({id:a.id,name:a.name,status:a.account_status,currency:a.currency}))});
}));
app.post('/api/meta/map-account',admin,handler(async(req,res)=>{
 const {slot,meta_account_id,meta_account_name}=req.body||{};
 if(!Number.isInteger(slot)||slot<1||slot>10||!/^act_\d+$/.test(meta_account_id||''))return fail(res,400,'Invalid slot or Meta ID');
 const duplicate=await rows('SELECT slot FROM ad_accounts WHERE meta_account_id=? AND slot<>?',[meta_account_id,slot]);if(duplicate.length)return fail(res,409,'Meta account already mapped');
 await rows('UPDATE ad_accounts SET meta_account_id=?,meta_account_name=? WHERE slot=?',[meta_account_id,typeof meta_account_name==='string'?meta_account_name.slice(0,200):null,slot]);
 res.json({account:(await rows('SELECT * FROM ad_accounts WHERE slot=?',[slot]))[0]});
}));
app.use('/api',(_req,res)=>fail(res,404,'API route not found'));
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');app.use(express.static(root,{index:false}));
app.get('*',(_req,res)=>res.sendFile(path.join(root,'index.html'),err=>{if(err&&!res.headersSent)res.status(404).send('Build frontend: npm run build')}));
app.use((err,req,res,next)=>{console.error('Request error',err.message);if(!res.headersSent)fail(res,500,'Request failed. Check server logs.')});
app.listen(PORT,'0.0.0.0',()=>console.log(`CI Ads Manager ready on ${PORT}`));
