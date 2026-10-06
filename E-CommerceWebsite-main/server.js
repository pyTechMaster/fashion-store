require('dotenv').config();
const express=require('express'); const helmet=require('helmet'); const rateLimit=require('express-rate-limit'); const crypto=require('crypto'); const fs=require('fs'); const path=require('path');
const Razorpay=require('razorpay');
const app=express(); const PORT=process.env.PORT||3000;
app.use(helmet({contentSecurityPolicy:false})); app.use(express.json({limit:'100kb'}));
app.use('/api/',rateLimit({windowMs:15*60*1000,max:100,standardHeaders:true,legacyHeaders:false,skip:req=>req.path.startsWith('/products')||(req.method==='GET'&&req.path.startsWith('/reviews'))}));
// Data folder. Set DATA_DIR in .env to a folder on a PERSISTENT disk (hosting services wipe the app folder on restart/redeploy).
const BUNDLED_DATA=path.join(__dirname,'server-data');
const dataDir=process.env.DATA_DIR?path.resolve(process.env.DATA_DIR):BUNDLED_DATA; const dbFile=path.join(dataDir,'database.json'); const stockFile=path.join(dataDir,'stock.json');
const backupDir=path.join(dataDir,'backups');
fs.mkdirSync(dataDir,{recursive:true});
if(dataDir!==BUNDLED_DATA){try{for(const f of fs.readdirSync(BUNDLED_DATA)){if(/^[\w-]+\.json$/.test(f)&&!fs.existsSync(path.join(dataDir,f)))fs.copyFileSync(path.join(BUNDLED_DATA,f),path.join(dataDir,f));}}catch{}}
// Crash-safe write: write a temp file, then rename it over the real one (a half-written file can never replace good data).
const atomicWrite=(f,str)=>{const t=f+'.tmp';fs.writeFileSync(t,str);fs.renameSync(t,f);};
const listSnapshots=()=>{try{return fs.readdirSync(backupDir).filter(n=>/^[\w-]+$/.test(n)&&fs.statSync(path.join(backupDir,n)).isDirectory()).sort().reverse();}catch{return[];}};
// Never silently treat a damaged data file as "empty" (that would wipe the store on the next save): restore the newest backup instead.
function readJSONSafe(file,fallback){
  if(!fs.existsSync(file))return fallback;
  try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{
    const name=path.basename(file);
    for(const snap of listSnapshots()){const sf=path.join(backupDir,snap,name);try{const txt=fs.readFileSync(sf,'utf8');const d=JSON.parse(txt);try{fs.copyFileSync(file,file+'.damaged-'+Date.now());}catch{}atomicWrite(file,txt);console.log('WARNING: '+name+' was damaged. Restored from backup '+snap+'.');return d;}catch{}}
    throw new Error(name+' is damaged and no backup could restore it.');
  }
} if(!fs.existsSync(dbFile))fs.writeFileSync(dbFile,JSON.stringify({users:[],orders:[],sessions:[],passwordResets:[]},null,2)); if(!fs.existsSync(stockFile))fs.writeFileSync(stockFile,'{}');
const readDB=()=>readJSONSafe(dbFile,{users:[],orders:[],sessions:[],passwordResets:[]}); const writeDB=db=>atomicWrite(dbFile,JSON.stringify(db,null,2));
const readStock=()=>readJSONSafe(stockFile,{}); const writeStock=s=>atomicWrite(stockFile,JSON.stringify(s,null,2));
const hashPassword=(password,salt=crypto.randomBytes(16).toString('hex'))=>({salt,hash:crypto.scryptSync(password,salt,64).toString('hex')});
const verifyPassword=(password,u)=>crypto.timingSafeEqual(Buffer.from(hashPassword(password,u.salt).hash,'hex'),Buffer.from(u.passwordHash,'hex'));
const token=()=>crypto.randomBytes(32).toString('hex');
function auth(req,res,next){const t=(req.headers.authorization||'').replace('Bearer ','');const db=readDB();const s=db.sessions.find(x=>x.token===t&&new Date(x.expiresAt)>new Date());if(!s)return res.status(401).json({message:'Please sign in.'});const u=db.users.find(x=>x.id===s.userId);if(!u)return res.status(401).json({message:'Account not found.'});req.user=u;req.db=db;next();}
const ADMIN_PLACEHOLDER='change_this_admin_key';
function adminKeyOk(k){const a=String(process.env.ADMIN_KEY||''),b=String(k||'');if(a.length<16||a===ADMIN_PLACEHOLDER)return false;const x=crypto.createHash('sha256').update(a).digest(),y=crypto.createHash('sha256').update(b).digest();return crypto.timingSafeEqual(x,y);}
function admin(req,res,next){if(!adminKeyOk(req.headers['x-admin-key']))return res.status(401).json({message:'Admin authentication required.'});next();}
const STORE_EMAIL='sakshipardeshi705@gmail.com';
// ---------- Email (optional, SMTP via nodemailer) ----------
let mailer=null;
if(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASS){try{mailer=require('nodemailer').createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT)||587,secure:Number(process.env.SMTP_PORT)===465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});}catch(e){console.log('Email disabled: run "npm install" (nodemailer missing).');}}
async function sendMail(to,subject,text){if(!mailer)return false;try{await mailer.sendMail({from:process.env.SMTP_FROM||('BRANDON <'+process.env.SMTP_USER+'>'),to,subject,text});return true;}catch(e){console.log('Email failed:',e.message);return false;}}
// ---------- Push notifications (optional, web-push) ----------
let webpush=null;
if(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY){try{webpush=require('web-push');webpush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:'+STORE_EMAIL,process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);}catch(e){webpush=null;console.log('Push disabled: run "npm install" (web-push missing).');}}
async function notifyUser(userId,title,body,tag){if(!webpush)return;const subs=(readDB().pushSubs||[]).filter(x=>x.userId===userId);const dead=[];await Promise.all(subs.map(x=>webpush.sendNotification(x.subscription,JSON.stringify({title,body,tag,url:'my-orders.html'})).catch(err=>{if(err&&(err.statusCode===404||err.statusCode===410))dead.push(x.subscription.endpoint);})));if(dead.length){const db=readDB();db.pushSubs=(db.pushSubs||[]).filter(x=>!dead.includes(x.subscription.endpoint));writeDB(db);}}
const orderMsg=(o,oldS,oldP)=>o.paymentStatus!==oldP?(o.paymentStatus==='Paid'?'Payment received for your order '+o.orderId+'. Thank you!':o.paymentStatus==='Rejected'?'We could not verify the payment for order '+o.orderId+'. The order was cancelled.':'Payment update for order '+o.orderId+': '+o.paymentStatus):'Your order '+o.orderId+' is now: '+o.status;
const productsFile=path.join(dataDir,'products.json');
function localProducts(){try{return(JSON.parse(fs.readFileSync(productsFile,'utf8')).products||[]).map(p=>({isAccessory:false,photos:[],...p,id:String(p.id),preview:p.preview||'/img/placeholder.svg'}));}catch{return[];}}
let remoteCache={t:0,d:[]};
async function remoteProducts(){if(Date.now()-remoteCache.t<60000)return remoteCache.d;try{const r=await fetch('https://5d76bf96515d1a0014085cf9.mockapi.io/product');if(r.ok){remoteCache={t:Date.now(),d:await r.json()};}}catch{}return remoteCache.d;}
const WOMEN_RE=/\b(women|womens|woman|ladies|lady|female|saree|sari|kurti|lehenga|skirt|bra|bikini)\b/i;
const keepRemote=p=>!p.isAccessory&&!WOMEN_RE.test(String(p.name||'')+' '+String(p.description||''));
async function getProducts(){const all=(await remoteProducts()).filter(keepRemote).concat(localProducts().filter(p=>!p.isAccessory));if(!all.length)throw new Error('Product service unavailable');return all;}
function findProduct(list,id){return list.find(p=>String(p.id)===String(id));}
function cartLines(products,ids){const counts={};ids.forEach(t=>counts[String(t)]=(counts[String(t)]||0)+1);let total=0;const lines=[];for(const token of Object.keys(counts)){const[id,size]=token.split('_');const p=findProduct(products,id);if(!p)throw new Error('Invalid product in cart');if(Array.isArray(p.sizes)&&p.sizes.length&&!p.sizes.includes(size))throw new Error('Please select a valid size for '+p.name);const qty=counts[token];total+=Number(p.price)*qty;lines.push({id:String(p.id),size:size||undefined,name:p.name+(size?' (Size '+size+')':''),price:Number(p.price),quantity:qty});}const st=readStock(),used={};for(const l of lines){used[l.id]=(used[l.id]||0)+l.quantity;const av=st[l.id]===undefined?10:Number(st[l.id]);if(used[l.id]>av)throw new Error('Insufficient stock for '+l.name);}return{total,lines};}
const settingsFile=path.join(dataDir,'payment-settings.json');
function paymentConfig(){let c={};try{c=JSON.parse(fs.readFileSync(settingsFile,'utf8'))}catch{}const upi=c.upi||{};const ready=upi.enabled!==false&&/^[\w.\-]{2,}@[\w.\-]{2,}$/.test(String(upi.upiId||''))&&!/YOUR/i.test(String(upi.upiId||''));return{cod:{enabled:(c.cod||{}).enabled!==false},upi:{enabled:ready,upiId:ready?String(upi.upiId):'',payeeName:String(upi.payeeName||'BRANDON'),qrImage:String(upi.qrImage||'img/upi-qr.png')}};}
function httpError(status,message){return Object.assign(new Error(message),{status});}
function pickAddress(user,id){const a=(user.addresses||[]).find(x=>x.id===id);if(!a)throw httpError(400,'Please select a delivery address.');return{label:a.label,name:a.name,phone:a.phone,address:a.address,city:a.city,state:a.state,pincode:a.pincode};}
const RETURN_WINDOW_DAYS=7; // keep in sync with public/return-policy.html
const stockOf=(st,id)=>st[id]===undefined?10:Number(st[id]);
function saveOrder(req,o){const db=readDB(),stock=readStock();for(const l of o.lines){if(stockOf(stock,l.id)<l.quantity)throw httpError(409,'Insufficient stock for '+l.name);}for(const l of o.lines)stock[l.id]=stockOf(stock,l.id)-l.quantity;writeStock(stock);const order={orderId:'SL-'+Date.now().toString().slice(-8)+crypto.randomInt(10,100),userId:req.user.id,customer:req.user.email,customerName:req.user.name,items:o.lines,amount:o.total,subtotal:o.subtotal!==undefined?o.subtotal:o.total,discount:o.discount||0,coupon:o.coupon||null,paymentMethod:o.method,paymentStatus:o.paymentStatus,paymentId:o.paymentId||null,address:o.address||null,status:'Placed',createdAt:new Date().toISOString(),request:null};db.orders.push(order);writeDB(db);notifyUser(req.user.id,'Order placed','Thank you! Your order '+order.orderId+' has been placed.',order.orderId+'-Placed');autoMessage(order,'BRANDON: Thank you! Your order '+order.orderId+' of Rs '+order.amount+' has been placed. You can track it in My Orders.');return order;}
function restoreStock(order){if(order.stockRestored)return;const stock=readStock();for(const l of order.items||[])stock[l.id]=stockOf(stock,l.id)+Number(l.quantity||0);writeStock(stock);order.stockRestored=true;}
const razorpay=process.env.RAZORPAY_KEY_ID&&process.env.RAZORPAY_KEY_SECRET?new Razorpay({key_id:process.env.RAZORPAY_KEY_ID,key_secret:process.env.RAZORPAY_KEY_SECRET}):null;
app.post('/api/auth/register',(req,res)=>{const{name,email,password}=req.body||{};if(!name||!email||!password||password.length<6)return res.status(400).json({message:'Name, email and a 6+ character password are required.'});const db=readDB();const e=email.trim().toLowerCase();if(db.users.some(u=>u.email===e))return res.status(409).json({message:'An account with this email already exists.'});const p=hashPassword(password);const u={id:crypto.randomUUID(),name:name.trim(),email:e,passwordHash:p.hash,salt:p.salt,createdAt:new Date().toISOString(),addresses:[]};db.users.push(u);writeDB(db);res.json({message:'Account created. Please sign in.'});});
app.post('/api/auth/login',(req,res)=>{const{email,password}=req.body||{};const db=readDB();const u=db.users.find(x=>x.email===String(email||'').trim().toLowerCase());if(!u||!verifyPassword(String(password||''),u))return res.status(401).json({message:'Incorrect email or password.'});const t=token();db.sessions=db.sessions.filter(s=>new Date(s.expiresAt)>new Date());db.sessions.push({token:t,userId:u.id,expiresAt:new Date(Date.now()+7*24*60*60*1000).toISOString()});writeDB(db);res.json({token:t,user:{id:u.id,name:u.name,email:u.email,addresses:u.addresses||[]}});});
app.post('/api/auth/forgot',async(req,res)=>{const{email}=req.body||{};const db=readDB();const u=db.users.find(x=>x.email===String(email||'').trim().toLowerCase());const message='If this email has an account, a 6-digit reset code is on its way (valid for 15 minutes). Did not get it? Tap the WhatsApp button below and we will send it to you.';if(!u)return res.json({message});db.passwordResets=(db.passwordResets||[]).filter(x=>x.userId!==u.id&&new Date(x.expiresAt)>new Date());const code=String(crypto.randomInt(100000,1000000));db.passwordResets.push({id:crypto.randomUUID(),userId:u.id,code,tries:0,expiresAt:new Date(Date.now()+15*60*1000).toISOString(),createdAt:new Date().toISOString()});writeDB(db);const sent=await sendMail(u.email,'Your BRANDON password reset code','Hi '+u.name+',\n\nYour BRANDON password reset code is: '+code+'\nIt is valid for 15 minutes. If you did not ask for this, you can ignore this email.\n\n- BRANDON');if(sent){const d2=readDB();const r=d2.passwordResets.find(x=>x.code===code&&x.userId===u.id);if(r){r.emailed=true;writeDB(d2);}}res.json({message,demoCode:process.env.DEMO_RESET==='true'?code:undefined});});
app.post('/api/auth/reset',(req,res)=>{const{email,code,password}=req.body||{};const db=readDB();const u=db.users.find(x=>x.email===String(email||'').trim().toLowerCase());const bad=()=>res.status(400).json({message:'Invalid or expired reset code.'});if(!u||!password||password.length<6)return bad();const r=(db.passwordResets||[]).find(x=>x.userId===u.id&&new Date(x.expiresAt)>new Date());if(!r)return bad();const ok=String(code||'').length===r.code.length&&crypto.timingSafeEqual(Buffer.from(String(code)),Buffer.from(r.code));if(!ok){r.tries=(r.tries||0)+1;if(r.tries>=5)db.passwordResets=db.passwordResets.filter(x=>x!==r);writeDB(db);return bad();}const p=hashPassword(password);u.passwordHash=p.hash;u.salt=p.salt;db.passwordResets=db.passwordResets.filter(x=>x!==r);db.sessions=db.sessions.filter(x=>x.userId!==u.id);writeDB(db);res.json({message:'Password reset successfully. Please sign in.'});});
app.get('/api/admin/resets',admin,(req,res)=>{const db=readDB();res.json({resets:(db.passwordResets||[]).filter(r=>new Date(r.expiresAt)>new Date()).map(r=>{const u=db.users.find(x=>x.id===r.userId)||{};const ph=((u.addresses||[]).find(a=>a.phone)||{}).phone||'';return{id:r.id,name:u.name,email:u.email,phone:ph,code:r.code,emailed:!!r.emailed,expiresAt:r.expiresAt};})});});
app.get('/api/push/key',(req,res)=>res.json({key:webpush?process.env.VAPID_PUBLIC_KEY:null}));
app.post('/api/push/subscribe',auth,(req,res)=>{const sub=(req.body||{}).subscription;if(!sub||typeof sub.endpoint!=='string'||!sub.keys)return res.status(400).json({message:'Invalid subscription'});const db=req.db;db.pushSubs=(db.pushSubs||[]).filter(x=>x.subscription.endpoint!==sub.endpoint);db.pushSubs.push({userId:req.user.id,subscription:sub,createdAt:new Date().toISOString()});writeDB(db);res.json({ok:true});});
app.get('/api/account',auth,(req,res)=>res.json({user:{id:req.user.id,name:req.user.name,email:req.user.email,addresses:req.user.addresses||[]}}));
app.post('/api/account/addresses',auth,(req,res)=>{const{label,name,phone,address,city,state,pincode}=req.body||{};if(!name||!phone||!address||!city||!state||!pincode)return res.status(400).json({message:'Complete address details are required.'});const a={id:crypto.randomUUID(),label:label||'Home',name,phone,address,city,state,pincode};req.user.addresses=req.user.addresses||[];req.user.addresses.push(a);writeDB(req.db);res.json({addresses:req.user.addresses});});
app.delete('/api/account/addresses/:id',auth,(req,res)=>{req.user.addresses=(req.user.addresses||[]).filter(a=>a.id!==req.params.id);writeDB(req.db);res.json({addresses:req.user.addresses});});
app.post('/api/auth/logout',auth,(req,res)=>{req.db.sessions=req.db.sessions.filter(s=>s.token!==(req.headers.authorization||'').replace('Bearer ',''));writeDB(req.db);res.json({ok:true});});
app.get('/api/admin/stats',admin,(req,res)=>{const db=readDB();res.json({users:db.users.length,orders:db.orders.length,paidOrders:db.orders.filter(o=>o.paymentStatus==='Paid').length,sales:db.orders.filter(o=>o.paymentStatus==='Paid').reduce((s,o)=>s+Number(o.amount||0),0)});});
app.get('/api/admin/users',admin,(req,res)=>{const db=readDB();res.json({users:db.users.map(u=>({id:u.id,name:u.name,email:u.email,createdAt:u.createdAt,addressCount:(u.addresses||[]).length}))});});
app.get('/api/admin/orders',admin,(req,res)=>{const db=readDB();res.json({orders:db.orders.slice().reverse()});});
app.patch('/api/admin/orders/:id',admin,(req,res)=>{const db=readDB();const o=db.orders.find(x=>x.orderId===req.params.id);if(!o)return res.status(404).json({message:'Order not found'});const oldS=o.status,oldP=o.paymentStatus;const{status,paymentStatus}=req.body||{};const STATUSES=['Placed','Confirmed','Packed','Shipped','Out for Delivery','Delivered','Cancelled','Cancellation Requested','Return Requested'];const PAYS=['Pending Verification','Paid','Rejected','Pay on Delivery'];if(status){if(!STATUSES.includes(status))return res.status(400).json({message:'Invalid status'});o.status=status;if(status==='Delivered'&&!o.deliveredAt)o.deliveredAt=new Date().toISOString();if(status==='Delivered'&&o.paymentMethod==='COD')o.paymentStatus='Paid';if(status==='Cancelled')restoreStock(o);}if(paymentStatus){if(!PAYS.includes(paymentStatus))return res.status(400).json({message:'Invalid payment status'});o.paymentStatus=paymentStatus;if(paymentStatus==='Paid'&&o.status==='Placed')o.status='Confirmed';if(paymentStatus==='Rejected'){o.status='Cancelled';restoreStock(o);}}writeDB(db);if(o.status!==oldS||o.paymentStatus!==oldP)notifyUser(o.userId,'BRANDON order update',orderMsg(o,oldS,oldP),o.orderId+'-'+o.status+'-'+o.paymentStatus);if(o.status!==oldS||o.paymentStatus!==oldP)autoMessage(o,'BRANDON: '+orderMsg(o,oldS,oldP));res.json({order:o});});
app.post('/api/orders/create',auth,async(req,res)=>{try{const{productIds}=req.body;if(!Array.isArray(productIds)||!productIds.length)return res.status(400).json({message:'Invalid cart'});pickAddress(req.user,req.body.addressId);const products=await getProducts();const{total:subtotal,lines}=cartLines(products,productIds);const cp=applyCoupon(req.body.couponCode,subtotal,req.user,readDB());const total=subtotal-cp.discount;const stock=readStock();for(const l of lines){const available=stock[l.id]===undefined?10:Number(stock[l.id]);if(available<l.quantity)return res.status(409).json({message:`Insufficient stock for ${l.name}`});}if(!razorpay){if(process.env.DEMO_PAYMENT==='true')return res.json({demo:true,order:saveOrder(req,{total,subtotal,discount:cp.discount,coupon:cp.code,lines,method:'Demo',paymentStatus:'Paid',paymentId:'DEMO-'+Date.now(),address:pickAddress(req.user,req.body.addressId)})});return res.status(503).json({message:'Razorpay is not configured. Add keys in .env.'});}const rp=await razorpay.orders.create({amount:Math.round(total*100),currency:'INR',receipt:'sl_'+Date.now(),notes:{userId:req.user.id,email:req.user.email}});res.json({key:process.env.RAZORPAY_KEY_ID,amount:rp.amount,currency:rp.currency,razorpayOrderId:rp.id,lines});}catch(e){res.status(e.status||500).json({message:e.message||'Unable to create order'});}});
app.post('/api/orders/verify',auth,async(req,res)=>{try{const{razorpay_order_id,razorpay_payment_id,razorpay_signature,productIds}=req.body;if(!razorpay_order_id||!razorpay_payment_id||!razorpay_signature)return res.status(400).json({message:'Missing payment verification data'});const expected=crypto.createHmac('sha256',process.env.RAZORPAY_KEY_SECRET).update(razorpay_order_id+'|'+razorpay_payment_id).digest('hex');if(expected!==razorpay_signature)return res.status(400).json({message:'Payment verification failed'});const products=await getProducts();const{total:subtotal,lines}=cartLines(products,productIds);const cp=applyCoupon(req.body.couponCode,subtotal,req.user,readDB());const total=subtotal-cp.discount;let payment;try{payment=await razorpay.payments.fetch(razorpay_payment_id);}catch{payment=null;}if(payment&&Number(payment.amount)!==Math.round(total*100))return res.status(400).json({message:'Payment amount does not match the order total.'});const db=readDB();if(db.orders.some(o=>o.paymentId===razorpay_payment_id))return res.json({ok:true,order:db.orders.find(o=>o.paymentId===razorpay_payment_id)});const order=saveOrder(req,{total,subtotal,discount:cp.discount,coupon:cp.code,lines,method:'Razorpay',paymentStatus:'Paid',paymentId:razorpay_payment_id,address:pickAddress(req.user,req.body.addressId)});res.json({ok:true,order});}catch(e){res.status(e.status||500).json({message:e.message||'Verification failed.'});}});
app.get('/api/orders',auth,(req,res)=>{const db=readDB();res.json({orders:db.orders.filter(o=>o.userId===req.user.id).reverse()});});
app.post('/api/orders/:id/request',auth,(req,res)=>{const db=readDB();const o=db.orders.find(x=>x.orderId===req.params.id&&x.userId===req.user.id);if(!o)return res.status(404).json({message:'Order not found'});const type=req.body.type;if(type==='cancel'&&['Placed','Confirmed'].includes(o.status)){o.status='Cancellation Requested';o.request={type:'cancel',createdAt:new Date().toISOString()};}else if(type==='return'&&o.status==='Delivered'&&o.deliveredAt&&Date.now()-new Date(o.deliveredAt).getTime()>RETURN_WINDOW_DAYS*86400000)return res.status(400).json({message:'The '+RETURN_WINDOW_DAYS+'-day return window for this order has ended.'});else if(type==='return'&&o.status==='Delivered'){o.status='Return Requested';o.request={type:'return',createdAt:new Date().toISOString(),reason:req.body.reason||''};}else return res.status(400).json({message:'This request is not available for the current order status.'});writeDB(db);res.json({order:o});});
app.get('/api/payment-config',(req,res)=>{const c=paymentConfig();res.json({cod:c.cod,upi:c.upi,razorpay:!!razorpay||process.env.DEMO_PAYMENT==='true'});});
app.post('/api/orders/place',auth,async(req,res)=>{try{const{productIds,method,addressId,utr}=req.body||{};if(!Array.isArray(productIds)||!productIds.length||productIds.length>100)return res.status(400).json({message:'Invalid cart'});const cfg=paymentConfig();if(method==='cod'&&!cfg.cod.enabled)return res.status(400).json({message:'Cash on Delivery is not available.'});if(method==='upi'&&!cfg.upi.enabled)return res.status(400).json({message:'Online UPI payment is not available.'});if(method!=='cod'&&method!=='upi')return res.status(400).json({message:'Please choose a payment method.'});const address=pickAddress(req.user,addressId);const products=await getProducts();const{total:subtotal,lines}=cartLines(products,productIds);const cp=applyCoupon(req.body.couponCode,subtotal,req.user,readDB());const total=subtotal-cp.discount;let paymentId=null,paymentStatus='Pay on Delivery';if(method==='upi'){const ref=String(utr||'').trim().toUpperCase();if(!/^[A-Z0-9]{10,25}$/.test(ref))return res.status(400).json({message:'Enter the UPI transaction ID / UTR shown in your payment app (12 digits).'});if(readDB().orders.some(o=>o.paymentId===ref))return res.status(409).json({message:'This transaction ID has already been used for another order.'});paymentId=ref;paymentStatus='Pending Verification';}const order=saveOrder(req,{total,subtotal,discount:cp.discount,coupon:cp.code,lines,method:method==='upi'?'UPI':'COD',paymentStatus,paymentId,address});res.json({ok:true,order});}catch(e){res.status(e.status||500).json({message:e.message||'Unable to place order'});}});
app.get('/api/products',async(req,res)=>{try{const st=readStock();res.json((await getProducts()).map(p=>({...p,stock:stockOf(st,String(p.id))})));}catch(e){res.status(502).json({message:e.message});}});
app.get('/api/products/:id',async(req,res)=>{try{const p=findProduct(await getProducts(),req.params.id);if(!p)return res.status(404).json({message:'Product not found'});res.json({...p,stock:stockOf(readStock(),String(p.id))});}catch(e){res.status(502).json({message:e.message});}});

/* ================= Coupons ================= */
const couponsFile=path.join(dataDir,'coupons.json'); const reviewsFile=path.join(dataDir,'reviews.json');
if(!fs.existsSync(couponsFile))fs.writeFileSync(couponsFile,JSON.stringify({coupons:[
 {code:'WELCOME10',description:'10% off on your order (max Rs 200)',type:'percent',value:10,maxDiscount:200,minOrder:499,expiresAt:'',usageLimit:0,perUserLimit:1,active:true},
 {code:'FLAT100',description:'Flat Rs 100 off on orders above Rs 999',type:'flat',value:100,maxDiscount:0,minOrder:999,expiresAt:'',usageLimit:0,perUserLimit:1,active:true}
]},null,2));
if(!fs.existsSync(reviewsFile))fs.writeFileSync(reviewsFile,JSON.stringify({reviews:[]},null,2));
const readCoupons=()=>(readJSONSafe(couponsFile,{coupons:[]}).coupons||[]);
const writeCoupons=c=>atomicWrite(couponsFile,JSON.stringify({coupons:c},null,2));
const couponUsed=(db,code,userId)=>db.orders.filter(o=>o.coupon===code&&o.status!=='Cancelled'&&o.paymentStatus!=='Rejected'&&(!userId||o.userId===userId)).length;
function applyCoupon(raw,subtotal,user,db){
  const code=String(raw||'').trim().toUpperCase(); if(!code)return{code:null,discount:0};
  const c=readCoupons().find(x=>x.code===code); if(!c||c.active===false)throw httpError(400,'Invalid coupon code.');
  if(c.expiresAt&&new Date(c.expiresAt+'T23:59:59')<new Date())throw httpError(400,'This coupon has expired.');
  if(Number(c.minOrder)>subtotal)throw httpError(400,'Add items worth Rs '+(Number(c.minOrder)-subtotal)+' more to use this coupon (minimum order Rs '+Number(c.minOrder)+').');
  if(Number(c.usageLimit)>0&&couponUsed(db,code)>=Number(c.usageLimit))throw httpError(400,'This coupon has reached its usage limit.');
  const per=Number(c.perUserLimit===undefined?1:c.perUserLimit); if(per>0&&couponUsed(db,code,user.id)>=per)throw httpError(400,'You have already used this coupon.');
  let d=c.type==='percent'?Math.floor(subtotal*Number(c.value)/100):Number(c.value);
  if(c.type==='percent'&&Number(c.maxDiscount)>0)d=Math.min(d,Number(c.maxDiscount));
  d=Math.max(0,Math.min(d,subtotal-1));
  return{code,discount:d,description:c.description||''};
}
app.post('/api/coupons/validate',auth,async(req,res)=>{try{const{code,productIds}=req.body||{};if(!Array.isArray(productIds)||!productIds.length)return res.status(400).json({message:'Invalid cart'});const{total:subtotal}=cartLines(await getProducts(),productIds);const cp=applyCoupon(code,subtotal,req.user,readDB());if(!cp.code)return res.status(400).json({message:'Enter a coupon code.'});res.json({code:cp.code,description:cp.description,discount:cp.discount,subtotal,total:subtotal-cp.discount});}catch(e){res.status(e.status||400).json({message:e.message||'Could not apply coupon'});}});
app.get('/api/admin/coupons',admin,(req,res)=>{const db=readDB();res.json({coupons:readCoupons().map(c=>({...c,used:couponUsed(db,c.code)}))});});
app.post('/api/admin/coupons',admin,(req,res)=>{const b=req.body||{};const code=String(b.code||'').trim().toUpperCase();if(!/^[A-Z0-9_-]{3,20}$/.test(code))return res.status(400).json({message:'Code must be 3-20 letters/numbers.'});const type=b.type==='flat'?'flat':'percent';const value=Number(b.value);if(!(value>0)||(type==='percent'&&value>90))return res.status(400).json({message:type==='percent'?'Percent must be between 1 and 90.':'Enter a discount amount.'});const c={code,description:String(b.description||'').slice(0,120),type,value,maxDiscount:Math.max(0,Number(b.maxDiscount)||0),minOrder:Math.max(0,Number(b.minOrder)||0),expiresAt:/^\d{4}-\d{2}-\d{2}$/.test(String(b.expiresAt||''))?b.expiresAt:'',usageLimit:Math.max(0,Math.floor(Number(b.usageLimit)||0)),perUserLimit:Math.max(0,Math.floor(b.perUserLimit===undefined||b.perUserLimit===''?1:Number(b.perUserLimit)||0)),active:b.active!==false};const list=readCoupons().filter(x=>x.code!==code);list.push(c);writeCoupons(list);res.json({coupon:c});});
app.delete('/api/admin/coupons/:code',admin,(req,res)=>{writeCoupons(readCoupons().filter(x=>x.code!==String(req.params.code).toUpperCase()));res.json({ok:true});});

/* ================= Reviews & ratings ================= */
const readReviews=()=>(readJSONSafe(reviewsFile,{reviews:[]}).reviews||[]);
const writeReviews=r=>atomicWrite(reviewsFile,JSON.stringify({reviews:r},null,2));
const shortName=n=>{const p=String(n||'Customer').trim().split(/\s+/);return p.length>1?p[0]+' '+p[p.length-1][0].toUpperCase()+'.':p[0];};
function statsOf(list){const dist={1:0,2:0,3:0,4:0,5:0};list.forEach(r=>dist[r.rating]++);const count=list.length;const avg=count?Math.round(list.reduce((a,r)=>a+r.rating,0)/count*10)/10:0;return{avg,count,dist};}
function optionalUser(req){const t=(req.headers.authorization||'').replace('Bearer ','');if(!t)return null;const db=readDB();const s=db.sessions.find(x=>x.token===t&&new Date(x.expiresAt)>new Date());return s?db.users.find(x=>x.id===s.userId)||null:null;}
app.get('/api/reviews/summary',(req,res)=>{const by={};readReviews().forEach(r=>(by[r.productId]=by[r.productId]||[]).push(r));const out={};Object.keys(by).forEach(k=>{const s=statsOf(by[k]);out[k]={avg:s.avg,count:s.count};});res.json(out);});
app.get('/api/reviews/:pid',(req,res)=>{const pid=String(req.params.pid);const me=optionalUser(req);const list=readReviews().filter(r=>r.productId===pid);const st=statsOf(list);const mine=me?list.find(r=>r.userId===me.id):null;
  res.json({...st,signedIn:!!me,canReviewVerified:me?readDB().orders.some(o=>o.userId===me.id&&o.status!=='Cancelled'&&o.paymentStatus!=='Rejected'&&(o.items||[]).some(i=>String(i.id)===pid)):false,mine:mine?{rating:mine.rating,title:mine.title,comment:mine.comment}:null,
  reviews:list.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(r=>({id:r.id,name:r.name,rating:r.rating,title:r.title,comment:r.comment,verified:!!r.verified,createdAt:r.createdAt,mine:!!(me&&r.userId===me.id)}))});});
app.post('/api/reviews/:pid',auth,async(req,res)=>{try{const pid=String(req.params.pid);if(!findProduct(await getProducts(),pid))return res.status(404).json({message:'Product not found'});const rating=Math.round(Number(req.body&&req.body.rating));if(!(rating>=1&&rating<=5))return res.status(400).json({message:'Please choose a star rating (1 to 5).'});
  const title=String(req.body.title||'').trim().slice(0,80),comment=String(req.body.comment||'').trim().slice(0,600);const verified=req.db.orders.some(o=>o.userId===req.user.id&&o.status!=='Cancelled'&&o.paymentStatus!=='Rejected'&&(o.items||[]).some(i=>String(i.id)===pid));
  const all=readReviews();const i=all.findIndex(r=>r.productId===pid&&r.userId===req.user.id);const rec={id:i>=0?all[i].id:crypto.randomUUID(),productId:pid,userId:req.user.id,name:shortName(req.user.name),rating,title,comment,verified,createdAt:new Date().toISOString()};if(i>=0)all[i]=rec;else all.push(rec);writeReviews(all);res.json({ok:true,updated:i>=0});}catch(e){res.status(e.status||500).json({message:e.message||'Could not save review'});}});
app.delete('/api/reviews/:pid',auth,(req,res)=>{writeReviews(readReviews().filter(r=>!(r.productId===String(req.params.pid)&&r.userId===req.user.id)));res.json({ok:true});});
app.get('/api/admin/reviews',admin,(req,res)=>res.json({reviews:readReviews().slice().reverse()}));
app.delete('/api/admin/reviews/:id',admin,(req,res)=>{writeReviews(readReviews().filter(r=>r.id!==req.params.id));res.json({ok:true});});



// ---------- Admin: products, stock, payment settings, image upload ----------
const SECTIONS=['men','boys','girls','shoes'],TYPES=['pant','shirt','tshirt','short','dress','shoes'];
const writeJSONAtomic=(f,o)=>atomicWrite(f,JSON.stringify(o,null,1));
function readProductsFile(){try{const j=JSON.parse(fs.readFileSync(productsFile,'utf8'));j.products=j.products||[];return j;}catch{return{products:[]};}}
function adminProductList(){const st=readStock();return readProductsFile().products.map(p=>({...p,stock:stockOf(st,String(p.id))}));}
function cleanProduct(b,existing){
  const name=String(b.name||'').trim().slice(0,120);if(!name)throw httpError(400,'Product name is required.');
  const price=Number(b.price);if(!(price>0))throw httpError(400,'Enter a selling price greater than 0.');
  let mrp=Number(b.mrp);if(!(mrp>0))mrp=price;if(mrp<price)throw httpError(400,'MRP cannot be lower than the selling price.');
  const section=SECTIONS.includes(b.section)?b.section:null;if(!section)throw httpError(400,'Choose a section (men / boys / girls / shoes).');
  const type=TYPES.includes(b.type)?b.type:null;if(!type)throw httpError(400,'Choose a product type.');
  const sizes=(Array.isArray(b.sizes)?b.sizes:String(b.sizes||'').split(',')).map(x=>String(x).trim()).filter(Boolean).slice(0,20);if(sizes.some(x=>!/^[\w.\-\/ ]{1,10}$/.test(x)||x.includes('_')))throw httpError(400,'Sizes may only contain letters, numbers, . - and no underscore (example: S, M, L or 28, 30, 32).');
  const okImg=v=>typeof v==='string'&&(v===''||/^img\/products\/[\w.\-]+\.(jpe?g|png|webp)$/i.test(v));
  const preview=b.preview||'';const photos=Array.isArray(b.photos)?b.photos:[];if(!okImg(preview)||!photos.every(okImg))throw httpError(400,'Invalid image path.');
  return{...(existing||{}),id:String((existing||{}).id||b.id),name,brand:String(b.brand||'BRANDON').trim().slice(0,60)||'BRANDON',section,type,price,mrp,sale:!!b.sale,description:String(b.description||'').trim().slice(0,1000)||name,preview,photos,sizes};
}
app.get('/api/admin/products',admin,(req,res)=>res.json({products:adminProductList(),sections:SECTIONS,types:TYPES}));
app.post('/api/admin/products',admin,(req,res)=>{try{const b=req.body||{};const f=readProductsFile();const id=b.id?String(b.id):'';const i=id?f.products.findIndex(p=>String(p.id)===id):-1;
  let p;if(i>=0){p=cleanProduct(b,f.products[i]);f.products[i]=p;}else{const nid=String(Math.max(2000,...f.products.map(x=>parseInt(x.id,10)||0))+1);p=cleanProduct({...b,id:nid});f.products.push(p);}
  if(b.stock!==undefined&&b.stock!==''){const n=Math.floor(Number(b.stock));if(!(n>=0))throw httpError(400,'Stock must be 0 or more.');const st=readStock();st[p.id]=n;writeStock(st);}
  writeJSONAtomic(productsFile,f);res.json({product:p});}catch(e){res.status(e.status||500).json({message:e.message});}});
app.delete('/api/admin/products/:id',admin,(req,res)=>{const f=readProductsFile();const n=f.products.length;f.products=f.products.filter(p=>String(p.id)!==req.params.id);if(f.products.length===n)return res.status(404).json({message:'Product not found'});writeJSONAtomic(productsFile,f);res.json({ok:true});});
app.patch('/api/admin/stock/:id',admin,(req,res)=>{const n=Math.floor(Number((req.body||{}).stock));if(!(n>=0))return res.status(400).json({message:'Stock must be 0 or more.'});if(!readProductsFile().products.some(p=>String(p.id)===req.params.id))return res.status(404).json({message:'Product not found'});const st=readStock();st[req.params.id]=n;writeStock(st);res.json({ok:true,stock:n});});
const IMG_EXT={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
function sniffImage(b){if(b.length>12&&b[0]===0xFF&&b[1]===0xD8)return'image/jpeg';if(b.length>12&&b.slice(0,8).equals(Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A])))return'image/png';if(b.length>12&&b.slice(0,4).toString()==='RIFF'&&b.slice(8,12).toString()==='WEBP')return'image/webp';return null;}
app.post('/api/admin/upload',admin,express.raw({type:'image/*',limit:'5mb'}),(req,res)=>{try{const buf=req.body;if(!Buffer.isBuffer(buf)||!buf.length)return res.status(400).json({message:'Choose an image file (JPG, PNG or WEBP, max 5 MB).'});const mime=sniffImage(buf);if(!mime)return res.status(400).json({message:'Only JPG, PNG or WEBP images are allowed.'});const ext=IMG_EXT[mime];
  if(req.query.kind==='qr'){const rel='img/upi-qr.'+ext;fs.writeFileSync(path.join(__dirname,'public',rel),buf);return res.json({path:rel});}
  const dir=path.join(__dirname,'public','img','products');fs.mkdirSync(dir,{recursive:true});const name=Date.now().toString(36)+'-'+crypto.randomBytes(3).toString('hex')+'.'+ext;fs.writeFileSync(path.join(dir,name),buf);res.json({path:'img/products/'+name});}catch(e){res.status(500).json({message:e.message});}});
app.get('/api/admin/payment-settings',admin,(req,res)=>{let c={};try{c=JSON.parse(fs.readFileSync(settingsFile,'utf8'))}catch{}const u=c.upi||{};res.json({cod:(c.cod||{}).enabled!==false,upiEnabled:u.enabled!==false,upiId:u.upiId||'',payeeName:u.payeeName||'',qrImage:u.qrImage||'img/upi-qr.png',razorpay:!!razorpay});});
app.post('/api/admin/payment-settings',admin,(req,res)=>{const b=req.body||{};const upiId=String(b.upiId||'').trim();if(upiId&&(!/^[\w.\-]{2,}@[\w.\-]{2,}$/.test(upiId)||/YOUR/i.test(upiId)))return res.status(400).json({message:'UPI ID looks wrong. Example: yourname@oksbi'});if(b.upiEnabled&&!upiId)return res.status(400).json({message:'Enter your UPI ID to turn UPI on.'});
  let c={};try{c=JSON.parse(fs.readFileSync(settingsFile,'utf8'))}catch{}const qr=/^img\/[\w.\-]+\.(png|jpe?g|webp)$/i.test(String(b.qrImage||''))?b.qrImage:((c.upi||{}).qrImage||'img/upi-qr.png');
  c.cod={...(c.cod||{}),enabled:!!b.cod};c.upi={...(c.upi||{}),enabled:!!b.upiEnabled,upiId,payeeName:String(b.payeeName||'').trim().slice(0,60),qrImage:qr};writeJSONAtomic(settingsFile,c);res.json({ok:true,config:paymentConfig()});});


// ---------- Backups: automatic snapshots, e-mailed copy, download, restore ----------
const BACKUP_FILES=['database.json','stock.json','products.json','coupons.json','reviews.json','payment-settings.json'];
const KEEP_SNAPSHOTS=Math.max(5,Number(process.env.BACKUP_KEEP)||40);
const dataFileList=()=>{try{return fs.readdirSync(dataDir).filter(f=>BACKUP_FILES.includes(f));}catch{return[];}};
function dataFingerprint(){const h=crypto.createHash('sha256');for(const f of dataFileList()){try{h.update(f).update(fs.readFileSync(path.join(dataDir,f)));}catch{}}return h.digest('hex');}
let lastFingerprint='';
function makeSnapshot(label,force){
  const fp=dataFingerprint();if(!force&&fp===lastFingerprint)return null;
  const stamp=new Date().toISOString().replace(/[:T]/g,'-').slice(0,19)+(label?'-'+label:'');
  const dir=path.join(backupDir,stamp);fs.mkdirSync(dir,{recursive:true});
  for(const f of dataFileList())fs.copyFileSync(path.join(dataDir,f),path.join(dir,f));
  lastFingerprint=fp;
  for(const old of listSnapshots().slice(KEEP_SNAPSHOTS)){try{fs.rmSync(path.join(backupDir,old),{recursive:true,force:true});}catch{}}
  return stamp;
}
const IMG_ROOT=path.join(__dirname,'public');
function imageFiles(){const out=[];try{const d=path.join(IMG_ROOT,'img','products');for(const f of fs.readdirSync(d))if(/^[\w.\-]+\.(jpe?g|png|webp)$/i.test(f))out.push('img/products/'+f);}catch{}try{for(const f of fs.readdirSync(path.join(IMG_ROOT,'img')))if(/^upi-qr\.(png|jpe?g|webp)$/i.test(f))out.push('img/'+f);}catch{}return out;}
function buildBundle(withImages){
  const b={app:'shoplane-backup',version:1,createdAt:new Date().toISOString(),files:{},images:{}};
  for(const f of dataFileList())b.files[f]=fs.readFileSync(path.join(dataDir,f),'utf8');
  let total=0;b.imagesSkipped=false;
  if(withImages)for(const rel of imageFiles()){try{const buf=fs.readFileSync(path.join(IMG_ROOT,rel));total+=buf.length;if(total>40*1024*1024){b.imagesSkipped=true;break;}b.images[rel]=buf.toString('base64');}catch{}}
  return b;
}
function restoreBundle(b){
  if(!b||typeof b!=='object'||b.app!=='shoplane-backup'||typeof b.files!=='object'||!b.files)throw httpError(400,'This is not a BRANDON backup file.');
  const names=Object.keys(b.files);if(!names.length)throw httpError(400,'Backup file is empty.');
  const parsed={};
  for(const n of names){if(!BACKUP_FILES.includes(n))throw httpError(400,'Unexpected file in backup: '+n);if(typeof b.files[n]!=='string')throw httpError(400,'Backup file is damaged ('+n+').');try{parsed[n]=JSON.parse(b.files[n]);}catch{throw httpError(400,'Backup file is damaged ('+n+').');}}
  if(parsed['database.json']&&(!Array.isArray(parsed['database.json'].users)||!Array.isArray(parsed['database.json'].orders)))throw httpError(400,'Backup has no valid customer/order data.');
  const imgs=b.images&&typeof b.images==='object'?Object.keys(b.images):[];
  for(const rel of imgs){if(!/^img\/(products\/[\w.\-]+\.(jpe?g|png|webp)|upi-qr\.(png|jpe?g|webp))$/i.test(rel))throw httpError(400,'Unexpected image in backup.');}
  makeSnapshot('before-restore',true);
  for(const n of names)atomicWrite(path.join(dataDir,n),b.files[n]);
  let restoredImgs=0;for(const rel of imgs){try{const buf=Buffer.from(String(b.images[rel]),'base64');if(!sniffImage(buf))continue;const dest=path.join(IMG_ROOT,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,buf);restoredImgs++;}catch{}}
  lastFingerprint='';return{files:names.length,images:restoredImgs};
}
const BACKUP_MAIL=()=>process.env.BACKUP_EMAIL||process.env.SMTP_USER||'';
const mailStampFile=path.join(backupDir,'.last-email');
async function emailBackupIfDue(force){
  if(!mailer||!BACKUP_MAIL())return false;
  let last=0;try{last=Number(fs.readFileSync(mailStampFile,'utf8'))||0;}catch{}
  if(!force&&Date.now()-last<23*3600*1000)return false;
  let bundle=buildBundle(true),buf=Buffer.from(JSON.stringify(bundle));let note='Includes product photos.';
  if(buf.length>20*1024*1024){bundle=buildBundle(false);buf=Buffer.from(JSON.stringify(bundle));note='Photos were too large for e-mail and are NOT included - download the full backup from the admin dashboard too.';}
  try{await mailer.sendMail({from:process.env.SMTP_FROM||('BRANDON <'+process.env.SMTP_USER+'>'),to:BACKUP_MAIL(),subject:'BRANDON daily backup '+new Date().toISOString().slice(0,10),text:'Attached is your BRANDON store backup (orders, customers, products, stock, settings). '+note+'\nKeep this e-mail safe. To restore: Admin dashboard > Backup & restore > Restore from file.',attachments:[{filename:'shoplane-backup-'+new Date().toISOString().slice(0,10)+'.json',content:buf}]});fs.mkdirSync(backupDir,{recursive:true});fs.writeFileSync(mailStampFile,String(Date.now()));return true;}catch(e){console.log('Backup e-mail failed:',e.message);return false;}
}
function backupTick(){try{makeSnapshot('auto',false);}catch(e){console.log('Backup failed:',e.message);}emailBackupIfDue(false).catch(()=>{});}
setTimeout(backupTick,3000);setInterval(backupTick,6*3600*1000).unref();
app.get('/api/admin/backups',admin,(req,res)=>{let last=0;try{last=Number(fs.readFileSync(mailStampFile,'utf8'))||0;}catch{}res.json({dataDir,customDataDir:!!process.env.DATA_DIR,emailTo:mailer?BACKUP_MAIL():'',lastEmail:last?new Date(last).toISOString():'',backups:listSnapshots().map(n=>{let size=0,files=0;try{for(const f of fs.readdirSync(path.join(backupDir,n))){files++;size+=fs.statSync(path.join(backupDir,n,f)).size;}}catch{}return{name:n,files,size};})});});
app.post('/api/admin/backups',admin,(req,res)=>{try{res.json({name:makeSnapshot('manual',true)});}catch(e){res.status(500).json({message:e.message});}});
app.post('/api/admin/backups/email',admin,async(req,res)=>{if(!mailer||!BACKUP_MAIL())return res.status(400).json({message:'E-mail is not set up. Fill SMTP_USER and SMTP_PASS in .env.'});const ok=await emailBackupIfDue(true);res.json(ok?{ok:true,to:BACKUP_MAIL()}:{ok:false});});
app.get('/api/admin/backup/download',admin,(req,res)=>{const buf=Buffer.from(JSON.stringify(buildBundle(true)));res.setHeader('Content-Type','application/json');res.setHeader('Content-Disposition','attachment; filename="shoplane-backup-'+new Date().toISOString().slice(0,10)+'.json"');res.setHeader('Content-Length',buf.length);res.end(buf);});
app.post('/api/admin/backup/restore',admin,express.raw({type:'application/octet-stream',limit:'80mb'}),(req,res)=>{try{let b;try{b=JSON.parse(Buffer.isBuffer(req.body)?req.body.toString('utf8'):'');}catch{throw httpError(400,'Could not read this file. Choose a BRANDON backup (.json).');}res.json({ok:true,...restoreBundle(b)});}catch(e){res.status(e.status||500).json({message:e.message});}});
app.post('/api/admin/backups/:name/restore',admin,(req,res)=>{try{const n=req.params.name;if(!/^[\w-]+$/.test(n)||!listSnapshots().includes(n))throw httpError(404,'Backup not found.');const dir=path.join(backupDir,n);const files={};for(const f of fs.readdirSync(dir))if(BACKUP_FILES.includes(f))files[f]=fs.readFileSync(path.join(dir,f),'utf8');res.json({ok:true,...restoreBundle({app:'shoplane-backup',files,images:{}})});}catch(e){res.status(e.status||500).json({message:e.message});}});

// ---------- PDF invoice (dependency-free PDF writer, A4, Helvetica) ----------
const STORE={name:'BRANDON',phone:'+91 93726 44129',email:'sakshipardeshi705@gmail.com'};
// Helvetica widths are approximated (avg 0.52em; bold 0.56em) - good enough for left/right alignment and wrapping.
function makePDF(){
  const pages=[];let cur=null;
  const esc=t=>String(t).replace(/[^\x20-\x7E]/g,'?').replace(/([\\()])/g,'\\$1');
  const api={
    page(){cur=[];pages.push(cur);},
    rect(x,y,w,h,fill){cur.push(fill[0]+' '+fill[1]+' '+fill[2]+' rg '+x+' '+(842-y-h)+' '+w+' '+h+' re f');},
    line(x1,y1,x2,y2,c,wd){cur.push(c[0]+' '+c[1]+' '+c[2]+' RG '+(wd||.6)+' w '+x1+' '+(842-y1)+' m '+x2+' '+(842-y2)+' l S');},
    width(t,size,bold){return String(t).length*size*(bold?.56:.52);},
    text(t,x,y,o){o=o||{};const size=o.size||10,bold=!!o.bold,c=o.color||[0,0,0];let px=x;const w=api.width(t,size,bold);if(o.align==='right')px=x-w;else if(o.align==='center')px=x-w/2;cur.push('BT /'+(bold?'F2':'F1')+' '+size+' Tf '+c[0]+' '+c[1]+' '+c[2]+' rg '+px.toFixed(2)+' '+(842-y-size).toFixed(2)+' Td ('+esc(t)+') Tj ET');},
    wrap(t,maxW,size,bold){const out=[];for(const para of String(t).split('\n')){let line='';for(const w of para.split(/\s+/)){const t2=line?line+' '+w:w;if(api.width(t2,size,bold)>maxW&&line){out.push(line);line=w;}else line=t2;}out.push(line);}return out;},
    build(title){
      const objs=[];const add=s=>{objs.push(s);return objs.length;};
      add('<< /Type /Catalog /Pages 2 0 R >>');add('PLACEHOLDER');
      const f1=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),f2=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      const kids=[];
      for(const p of pages){const body=p.join('\n');const c=add('<< /Length '+Buffer.byteLength(body)+' >>\nstream\n'+body+'\nendstream');kids.push(add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 '+f1+' 0 R /F2 '+f2+' 0 R >> >> /Contents '+c+' 0 R >>'));}
      objs[1]='<< /Type /Pages /Kids ['+kids.map(k=>k+' 0 R').join(' ')+'] /Count '+kids.length+' >>';
      const info=add('<< /Title ('+esc(title)+') /Producer (BRANDON) >>');
      let out='%PDF-1.4\n';const off=[];objs.forEach((o,i)=>{off.push(Buffer.byteLength(out));out+=(i+1)+' 0 obj\n'+o+'\nendobj\n';});
      const xr=Buffer.byteLength(out);out+='xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n'+off.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+(objs.length+1)+' /Root 1 0 R /Info '+info+' 0 R >>\nstartxref\n'+xr+'\n%%EOF';
      return Buffer.from(out,'latin1');
    }
  };
  return api;
}
function invoicePDF(o,res){
  const d=makePDF(),brand=[.373,.337,.839],ink=[.118,.106,.227],mut=[.416,.408,.565],L=48,R=547,money=n=>'Rs. '+Number(n||0).toFixed(2);
  d.page();d.rect(0,0,595,92,brand);
  d.text(STORE.name,L,28,{size:26,bold:true,color:[1,1,1]});d.text(STORE.phone+'  |  '+STORE.email,L,64,{size:10,color:[1,1,1]});d.text('INVOICE',R,32,{size:20,bold:true,color:[1,1,1],align:'right'});
  let y=116;
  const kv=(k,v,x,yy)=>{d.text(k,x,yy,{size:9,color:mut});d.text(String(v||'-'),x,yy+13,{size:10.5,bold:true,color:ink});};
  kv('Invoice / Order No.',o.orderId,L,y);kv('Date',new Date(o.createdAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}),300,y);y+=42;
  kv('Payment',(o.paymentMethod==='COD'?'Cash on Delivery':o.paymentMethod==='UPI'?'UPI':o.paymentMethod||'Online')+' - '+o.paymentStatus,L,y);kv('Order status',o.status,300,y);y+=50;
  const a=o.address||{};
  d.text('BILL TO / DELIVER TO',L,y,{size:9,color:mut});d.text(a.name||o.customerName||o.customer||'',L,y+14,{size:11,bold:true,color:ink});y+=32;
  for(const ln of [a.address,[a.city,a.state].filter(Boolean).join(', ')+(a.pincode?' - '+a.pincode:''),a.phone?'Phone: '+a.phone:'',o.customer?'Email: '+o.customer:''].filter(Boolean).flatMap(t=>d.wrap(t,330,10))){d.text(ln,L,y,{size:10,color:ink});y+=14;}
  y+=14;d.rect(L,y,R-L,24,[.925,.922,.984]);
  d.text('ITEM',L+8,y+8,{size:9.5,bold:true,color:brand});d.text('QTY',380,y+8,{size:9.5,bold:true,color:brand,align:'right'});d.text('PRICE',460,y+8,{size:9.5,bold:true,color:brand,align:'right'});d.text('AMOUNT',R-8,y+8,{size:9.5,bold:true,color:brand,align:'right'});y+=34;
  for(const it of (o.items||[])){
    const lines=d.wrap(it.name,290,10);
    if(y+lines.length*13>740){d.page();y=60;}
    lines.forEach((ln,i)=>d.text(ln,L+8,y+i*13,{size:10,color:ink}));
    d.text(String(it.quantity),380,y,{size:10,color:ink,align:'right'});d.text(money(it.price),460,y,{size:10,color:ink,align:'right'});d.text(money(Number(it.price)*Number(it.quantity)),R-8,y,{size:10,color:ink,align:'right'});
    y+=lines.length*13+8;d.line(L,y,R,y,[.87,.86,.945]);y+=10;
  }
  y+=6;
  const tot=(k,v,bold)=>{d.text(k,330,y,{size:bold?12:10,bold,color:ink});d.text(v,R-8,y,{size:bold?12:10,bold,color:ink,align:'right'});y+=bold?22:17;};
  tot('Subtotal',money(o.subtotal!==undefined?o.subtotal:o.amount));
  if(Number(o.discount)>0)tot('Discount'+(o.coupon?' ('+o.coupon+')':''),'- '+money(o.discount));
  tot('Shipping','Free');d.line(330,y,R,y,brand,1);y+=8;tot('Total',money(o.amount),true);
  d.text('Thank you for shopping with '+STORE.name+'. Returns accepted within '+RETURN_WINDOW_DAYS+' days of delivery (see Return Policy on the website).',297,780,{size:8.5,color:mut,align:'center'});
  d.text('This is a computer-generated invoice and does not need a signature.',297,793,{size:8.5,color:mut,align:'center'});
  const buf=d.build('Invoice '+o.orderId);
  res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','attachment; filename="Invoice-'+String(o.orderId).replace(/[^\w-]/g,'')+'.pdf"');res.setHeader('Content-Length',buf.length);res.end(buf);
}
app.get('/api/orders/:id/invoice',auth,(req,res)=>{const o=readDB().orders.find(x=>x.orderId===req.params.id&&x.userId===req.user.id);if(!o)return res.status(404).json({message:'Order not found'});invoicePDF(o,res);});
app.get('/api/admin/orders/:id/invoice',admin,(req,res)=>{const o=readDB().orders.find(x=>x.orderId===req.params.id);if(!o)return res.status(404).json({message:'Order not found'});invoicePDF(o,res);});

/* ================= Public config, Google sign-in, pincode check, auto WhatsApp/SMS ================= */
const GOOGLE_CLIENT_ID=()=>String(process.env.GOOGLE_CLIENT_ID||'').trim();
const GA_ID=()=>{const v=String(process.env.GA_MEASUREMENT_ID||'').trim();return /^G-[A-Z0-9]{6,}$/i.test(v)?v:'';};
// Front-end asks this once per page: Google client id (login button) and Analytics id. Both are public values; empty = feature off.
app.get('/api/public-config',(req,res)=>res.json({googleClientId:GOOGLE_CLIENT_ID(),gaId:GA_ID()}));
// Google sign-in: the browser sends Google's signed ID token; Google's own tokeninfo endpoint validates signature + expiry, we check audience, issuer and verified email.
app.post('/api/auth/google',async(req,res)=>{try{
  const cid=GOOGLE_CLIENT_ID();if(!cid)return res.status(503).json({message:'Google sign-in is not set up yet.'});
  const cred=String((req.body||{}).credential||'');if(cred.length<100||cred.length>4096)return res.status(400).json({message:'Invalid Google sign-in response.'});
  const r=await fetch('https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(cred),{signal:AbortSignal.timeout(7000)});const g=await r.json().catch(()=>({}));
  if(!r.ok||g.aud!==cid||!['accounts.google.com','https://accounts.google.com'].includes(g.iss)||String(g.email_verified)!=='true'||!g.email)return res.status(401).json({message:'Google sign-in could not be verified. Please try again.'});
  const db=readDB();const e=String(g.email).trim().toLowerCase();let u=db.users.find(x=>x.email===e);
  if(!u){const p=hashPassword(crypto.randomBytes(24).toString('hex'));u={id:crypto.randomUUID(),name:String(g.name||e.split('@')[0]).trim().slice(0,80),email:e,passwordHash:p.hash,salt:p.salt,createdAt:new Date().toISOString(),addresses:[],google:true};db.users.push(u);}
  const t=token();db.sessions=db.sessions.filter(s=>new Date(s.expiresAt)>new Date());db.sessions.push({token:t,userId:u.id,expiresAt:new Date(Date.now()+7*24*60*60*1000).toISOString()});writeDB(db);
  res.json({token:t,user:{id:u.id,name:u.name,email:u.email,addresses:u.addresses||[]}});
}catch(e){res.status(502).json({message:'Could not reach Google. Please try again.'});}});
// Pincode check: looks the pincode up on India Post's free API, then estimates delivery days from the store (Maharashtra). If the lookup is down, a format-based estimate is returned.
const pinCache=new Map();
const NEAR_STATES=['Gujarat','Goa','Karnataka','Madhya Pradesh','Chhattisgarh','Telangana','Dadra and Nagar Haveli','Daman and Diu','Dadra and Nagar Haveli and Daman and Diu'];
const FAR_STATES=['Jammu and Kashmir','Jammu & Kashmir','Ladakh','Arunachal Pradesh','Assam','Manipur','Meghalaya','Mizoram','Nagaland','Tripura','Sikkim','Andaman and Nicobar Islands','Lakshadweep'];
function pinEstimate(state,pin){
  const st=String(state||'');
  if(st){if(st==='Maharashtra')return[2,4];if(NEAR_STATES.includes(st))return[3,5];if(FAR_STATES.includes(st))return[7,10];return[4,7];}
  const p2=pin.slice(0,2),p3=pin.slice(0,3);
  if(['40','41','42','43','44'].includes(p2)&&p3!=='403')return[2,4];
  if(['18','19','78','79','74'].includes(p2))return[7,10];
  if(pin[0]==='3'||p3==='403')return[3,5];
  return[4,7];
}
app.get('/api/pincode/:pin',async(req,res)=>{
  const pin=String(req.params.pin||'').trim();
  if(!/^[1-9]\d{5}$/.test(pin))return res.status(400).json({message:'Enter a valid 6-digit pincode.'});
  const hit=pinCache.get(pin);if(hit&&Date.now()-hit.t<24*3600*1000)return res.json(hit.d);
  const cod=paymentConfig().cod.enabled;let d;
  try{
    const r=await fetch('https://api.postalpincode.in/pincode/'+pin,{signal:AbortSignal.timeout(5000)});const j=await r.json();const row=Array.isArray(j)?j[0]:null;
    if(row&&row.Status==='Success'&&Array.isArray(row.PostOffice)&&row.PostOffice.length){const po=row.PostOffice[0];const [mn,mx]=pinEstimate(po.State,pin);d={ok:true,pincode:pin,area:po.Name||'',district:po.District||'',state:po.State||'',minDays:mn,maxDays:mx,cod};}
    else if(row&&row.Status==='Error'){return res.status(404).json({message:'We could not find this pincode. Please check and try again.'});}
  }catch{}
  if(!d){const [mn,mx]=pinEstimate('',pin);d={ok:true,pincode:pin,area:'',district:'',state:'',minDays:mn,maxDays:mx,cod,approximate:true};}
  if(!d.approximate)pinCache.set(pin,{t:Date.now(),d});
  res.json(d);
});
// Automatic order messages to the customer's delivery phone number (optional, needs paid/keyed services; does nothing until keys are in .env).
const msgPhone=raw=>{const d=String(raw||'').replace(/\D/g,'');return d.length>=10?d.slice(-10):'';};
async function sendWhatsApp(to10,text){
  const tpl=String(process.env.WHATSAPP_TEMPLATE||'').trim();
  const body=tpl?{messaging_product:'whatsapp',to:'91'+to10,type:'template',template:{name:tpl,language:{code:process.env.WHATSAPP_LANG||'en'},components:[{type:'body',parameters:[{type:'text',text:text.replace(/\s+/g,' ').slice(0,900)}]}]}}
               :{messaging_product:'whatsapp',to:'91'+to10,type:'text',text:{body:text}};
  const r=await fetch('https://graph.facebook.com/v20.0/'+process.env.WHATSAPP_PHONE_ID+'/messages',{method:'POST',headers:{Authorization:'Bearer '+process.env.WHATSAPP_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  if(!r.ok)console.log('WhatsApp auto-message failed:',r.status,(await r.text()).slice(0,200));
}
async function sendSms(to10,text){
  const r=await fetch('https://www.fast2sms.com/dev/bulkV2',{method:'POST',headers:{authorization:process.env.FAST2SMS_KEY,'Content-Type':'application/json'},body:JSON.stringify({route:'q',message:text,language:'english',flash:0,numbers:to10}),signal:AbortSignal.timeout(10000)});
  if(!r.ok)console.log('SMS auto-message failed:',r.status,(await r.text()).slice(0,200));
}
async function autoMessage(order,text){
  try{const to=msgPhone(order&&order.address&&order.address.phone);if(!to)return;const jobs=[];
    if(process.env.WHATSAPP_TOKEN&&process.env.WHATSAPP_PHONE_ID)jobs.push(sendWhatsApp(to,text));
    if(process.env.FAST2SMS_KEY)jobs.push(sendSms(to,text));
    if(jobs.length)await Promise.allSettled(jobs);}catch(e){console.log('Auto message error:',e.message);}
}
app.use(express.static(path.join(__dirname,'public'))); app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html'))); app.listen(PORT,()=>{console.log(`BRANDON server running on http://localhost:${PORT}`);console.log('Data folder: '+dataDir+(process.env.DATA_DIR?'':'  (set DATA_DIR in .env to a persistent disk when you host the site)'));console.log(adminKeyOk(process.env.ADMIN_KEY)?`Admin dashboard: http://localhost:${PORT}/admin.html`:'WARNING: ADMIN_KEY missing/too short/placeholder in .env - admin dashboard is disabled.');});
