require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA = path.join(ROOT, "data");
const UPLOADS = path.join(ROOT, "public", "uploads");
fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });

if (!process.env.SESSION_SECRET || !process.env.ADMIN_PASSWORD) {
  console.error("Set SESSION_SECRET and ADMIN_PASSWORD in .env before starting.");
  process.exit(1);
}
if (process.env.NODE_ENV === "production" && process.env.ADMIN_PASSWORD === "ChangeThisPassword123!") {
  console.error("Change the default admin password before production.");
  process.exit(1);
}

const db = new Database(path.join(DATA, "nayr.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL,
 description TEXT DEFAULT '', price REAL NOT NULL, image TEXT DEFAULT '',
 stock INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT, customer_name TEXT NOT NULL, phone TEXT NOT NULL,
 address TEXT NOT NULL, payment_method TEXT NOT NULL, payment_phone TEXT DEFAULT '',
 transaction_id TEXT DEFAULT '', note TEXT DEFAULT '', items_json TEXT NOT NULL,
 total REAL NOT NULL, status TEXT NOT NULL DEFAULT 'নতুন',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);
const admin = db.prepare("SELECT id FROM admins WHERE username=?").get(process.env.ADMIN_USERNAME || "admin");
if (!admin) {
  db.prepare("INSERT INTO admins(username,password_hash) VALUES(?,?)")
    .run(process.env.ADMIN_USERNAME || "admin", bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12));
}
const defaults = {
  store_name: process.env.STORE_NAME || "NAYR",
  tagline: "আপনার পছন্দের কেনাকাটার ঠিকানা",
  whatsapp: "",
  bkash: "",
  nagad: "",
  announcement: "NAYR-এ স্বাগতম — নতুন কালেকশন দেখুন"
};
const putSetting = db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)");
Object.entries(defaults).forEach(([k,v]) => putSetting.run(k,v));

const categories = ["পাঞ্জাবি", "গেঞ্জি ও টি-শার্ট", "জুয়েলারি", "কসমেটিক্স", "গিফট আইটেম", "ফুড আইটেম"];
const count = db.prepare("SELECT COUNT(*) AS n FROM products").get().n;
if (!count) {
  const add = db.prepare("INSERT INTO products(name,category,description,price,image,stock) VALUES(?,?,?,?,?,?)");
  [
    ["ক্লাসিক কটন পাঞ্জাবি","পাঞ্জাবি","আরামদায়ক কাপড়ের নমুনা পণ্য।",1250,"",10],
    ["ক্যাজুয়াল টি-শার্ট","গেঞ্জি ও টি-শার্ট","দৈনন্দিন ব্যবহারের নমুনা পণ্য।",450,"",15],
    ["মিনিমাল জুয়েলারি সেট","জুয়েলারি","সাধারণ ডিজাইনের নমুনা পণ্য।",650,"",8],
    ["ডেইলি কেয়ার সেট","কসমেটিক্স","নমুনা পণ্য; কেনার আগে উপাদান যাচাই করুন।",890,"",7],
    ["গিফট বক্স","গিফট আইটেম","উপহার দেওয়ার জন্য নমুনা পণ্য।",550,"",12],
    ["খেজুর ও বাদাম প্যাক","ফুড আইটেম","নমুনা খাদ্যপণ্য; অ্যালার্জির উপাদান যাচাই করুন।",750,"",9]
  ].forEach(p=>add.run(...p));
}

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({limit:"1mb"}));
app.use(express.urlencoded({extended:true, limit:"1mb"}));
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: DATA }),
  secret: process.env.SESSION_SECRET,
  resave: false, saveUninitialized: false,
  cookie: { httpOnly:true, sameSite:"lax", secure: process.env.NODE_ENV==="production", maxAge: 1000*60*60*8 }
}));
app.use(express.static(path.join(ROOT,"public")));
const loginLimiter = rateLimit({windowMs:15*60*1000, limit:8, standardHeaders:true, legacyHeaders:false});
const upload = multer({
  storage: multer.diskStorage({
    destination: (_,__,cb)=>cb(null,UPLOADS),
    filename: (_,file,cb)=>cb(null,crypto.randomBytes(12).toString("hex")+path.extname(file.originalname).toLowerCase())
  }),
  limits:{fileSize:3*1024*1024},
  fileFilter:(_,file,cb)=>cb(null,["image/jpeg","image/png","image/webp","image/gif"].includes(file.mimetype))
});

function settingsObject(){
  return Object.fromEntries(db.prepare("SELECT key,value FROM settings").all().map(x=>[x.key,x.value]));
}
function auth(req,res,next){ if(!req.session.admin) return res.status(401).json({error:"প্রথমে Admin Login করুন"}); next(); }
function csrf(req,res,next){
  if(!req.session.csrf) req.session.csrf=crypto.randomBytes(24).toString("hex");
  res.locals.csrf=req.session.csrf;
  next();
}
app.use(csrf);
app.get("/api/store", (req,res)=>{
  res.json({settings:settingsObject(),categories,products:db.prepare("SELECT id,name,category,description,price,image,stock FROM products WHERE active=1 ORDER BY id DESC").all()});
});
app.post("/api/orders", (req,res)=>{
  const {customer_name,phone,address,payment_method,payment_phone,transaction_id,note,items}=req.body||{};
  if(!customer_name?.trim()||!/^01[3-9]\d{8}$/.test(String(phone||"").replace(/\D/g,""))||!address?.trim()||!Array.isArray(items)||!items.length)
    return res.status(400).json({error:"নাম, সঠিক মোবাইল নম্বর, ঠিকানা ও পণ্য দিন।"});
  if(!["Cash on Delivery","bKash","Nagad"].includes(payment_method)) return res.status(400).json({error:"পেমেন্ট পদ্ধতি সঠিক নয়।"});
  if(items.length>30) return res.status(400).json({error:"একসঙ্গে সর্বোচ্চ ৩০ ধরনের পণ্য অর্ডার করা যাবে।"});
  const safe=[], get=db.prepare("SELECT id,name,price,stock FROM products WHERE id=? AND active=1");
  let total=0;
  for(const item of items){
    const p=get.get(Number(item.id)), qty=Math.max(1,Math.min(20,Number(item.qty)||1));
    if(!p||p.stock<qty) return res.status(400).json({error:"একটি পণ্য বর্তমানে পর্যাপ্ত স্টকে নেই।"});
    safe.push({id:p.id,name:p.name,price:p.price,qty}); total+=p.price*qty;
  }
  const info=db.prepare(`INSERT INTO orders(customer_name,phone,address,payment_method,payment_phone,transaction_id,note,items_json,total)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(customer_name.trim(),String(phone).replace(/\D/g,""),address.trim(),payment_method,
    String(payment_phone||"").trim(),String(transaction_id||"").trim(),String(note||"").trim(),JSON.stringify(safe),total);
  const reduce=db.prepare("UPDATE products SET stock=stock-? WHERE id=?");
  safe.forEach(x=>reduce.run(x.qty,x.id));
  res.json({ok:true,order_id:info.lastInsertRowid,message:"অর্ডার গ্রহণ করা হয়েছে।"});
});
app.post("/api/admin/login",loginLimiter,(req,res)=>{
  const {username,password}=req.body||{};
  const row=db.prepare("SELECT * FROM admins WHERE username=?").get(String(username||""));
  if(!row||!bcrypt.compareSync(String(password||""),row.password_hash)) return res.status(401).json({error:"ইউজারনেম বা পাসওয়ার্ড ভুল।"});
  req.session.regenerate(err=>{
    if(err) return res.status(500).json({error:"Login করা যায়নি।"});
    req.session.admin={id:row.id,username:row.username};
    req.session.csrf=crypto.randomBytes(24).toString("hex");
    res.json({ok:true});
  });
});
app.get("/api/admin/me",auth,(req,res)=>res.json({username:req.session.admin.username,settings:settingsObject(),categories,csrf:req.session.csrf}));
app.post("/api/admin/logout",auth,(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/admin/orders",auth,(req,res)=>res.json(db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 300").all().map(o=>({...o,items:JSON.parse(o.items_json)}))));
app.patch("/api/admin/orders/:id",auth,(req,res)=>{
  const statuses=["নতুন","নিশ্চিত","প্রসেসিং","পাঠানো হয়েছে","সম্পন্ন","বাতিল"];
  if(!statuses.includes(req.body.status)) return res.status(400).json({error:"স্ট্যাটাস সঠিক নয়।"});
  const r=db.prepare("UPDATE orders SET status=? WHERE id=?").run(req.body.status,Number(req.params.id));
  res.json({ok:r.changes>0});
});
app.post("/api/admin/products",auth,(req,res)=>{
  const p=req.body||{};
  if(!p.name?.trim()||!categories.includes(p.category)||!Number.isFinite(Number(p.price))||Number(p.price)<0) return res.status(400).json({error:"পণ্যের নাম, ক্যাটাগরি ও সঠিক দাম দিন।"});
  const r=db.prepare("INSERT INTO products(name,category,description,price,image,stock) VALUES(?,?,?,?,?,?)")
    .run(p.name.trim(),p.category,String(p.description||""),Number(p.price),String(p.image||""),Math.max(0,Number(p.stock)||0));
  res.json({ok:true,id:r.lastInsertRowid});
});
app.put("/api/admin/products/:id",auth,(req,res)=>{
  const p=req.body||{};
  if(!p.name?.trim()||!categories.includes(p.category)||!Number.isFinite(Number(p.price))||Number(p.price)<0) return res.status(400).json({error:"পণ্যের তথ্য সঠিক নয়।"});
  db.prepare("UPDATE products SET name=?,category=?,description=?,price=?,image=?,stock=?,active=? WHERE id=?")
    .run(p.name.trim(),p.category,String(p.description||""),Number(p.price),String(p.image||""),Math.max(0,Number(p.stock)||0),p.active===false?0:1,Number(req.params.id));
  res.json({ok:true});
});
app.delete("/api/admin/products/:id",auth,(req,res)=>{
  db.prepare("UPDATE products SET active=0 WHERE id=?").run(Number(req.params.id)); res.json({ok:true});
});
app.post("/api/admin/upload",auth,upload.single("image"),(req,res)=>{
  if(!req.file) return res.status(400).json({error:"JPG, PNG, WEBP বা GIF ছবি (সর্বোচ্চ ৩ MB) দিন।"});
  res.json({url:"/uploads/"+req.file.filename});
});
app.put("/api/admin/settings",auth,(req,res)=>{
  const allowed=["store_name","tagline","whatsapp","bkash","nagad","announcement"];
  const put=db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  for(const k of allowed) if(req.body[k]!==undefined) put.run(k,String(req.body[k]).slice(0,250));
  res.json({ok:true});
});
app.post("/api/admin/password",auth,(req,res)=>{
  const {current_password,new_password}=req.body||{};
  const row=db.prepare("SELECT * FROM admins WHERE id=?").get(req.session.admin.id);
  if(!bcrypt.compareSync(String(current_password||""),row.password_hash)) return res.status(400).json({error:"বর্তমান পাসওয়ার্ড সঠিক নয়।"});
  if(String(new_password||"").length<12) return res.status(400).json({error:"নতুন পাসওয়ার্ড কমপক্ষে ১২ অক্ষরের হতে হবে।"});
  db.prepare("UPDATE admins SET password_hash=? WHERE id=?").run(bcrypt.hashSync(new_password,12),row.id);
  res.json({ok:true});
});
app.get("/admin",(req,res)=>res.sendFile(path.join(ROOT,"public","admin.html")));
app.get("*",(req,res)=>res.sendFile(path.join(ROOT,"public","index.html")));
app.listen(PORT,()=>console.log(`NAYR running on http://localhost:${PORT}`));
