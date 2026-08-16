const express = require("express");
const session = require("cookie-session");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 10000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL ? { rejectUnauthorized:false } : false });

app.set("view engine","ejs");
app.set("views",__dirname+"/views");
app.use(express.urlencoded({extended:true}));
app.use(express.json());
app.use(express.static(__dirname+"/public"));
app.use(session({name:"matt_session",keys:[process.env.SESSION_SECRET||"dev-secret-change-me"],maxAge:7*24*60*60*1000,httpOnly:true,sameSite:"lax"}));

async function db(q,p=[]){return pool.query(q,p)}
async function init(){
  await db(`CREATE TABLE IF NOT EXISTS products(
    id SERIAL PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,description TEXT DEFAULT '',
    price NUMERIC(12,2) NOT NULL,stock INTEGER NOT NULL DEFAULT 0,image TEXT DEFAULT '',active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW())`);
  await db(`CREATE TABLE IF NOT EXISTS customers(
    id SERIAL PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,phone TEXT DEFAULT '',
    password_hash TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW())`);
  await db(`CREATE TABLE IF NOT EXISTS orders(
    id SERIAL PRIMARY KEY,customer_id INTEGER REFERENCES customers(id),customer_name TEXT NOT NULL,
    email TEXT NOT NULL,phone TEXT DEFAULT '',address TEXT DEFAULT '',city TEXT DEFAULT '',postal_code TEXT DEFAULT '',
    total NUMERIC(12,2) NOT NULL,status TEXT NOT NULL DEFAULT 'pending',payment_status TEXT NOT NULL DEFAULT 'unpaid',
    payment_method TEXT DEFAULT 'whatsapp',created_at TIMESTAMPTZ DEFAULT NOW())`);
  await db(`CREATE TABLE IF NOT EXISTS order_items(
    id SERIAL PRIMARY KEY,order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,product_id INTEGER,
    name TEXT NOT NULL,quantity INTEGER NOT NULL,unit_price NUMERIC(12,2) NOT NULL)`);
  const c=await db("SELECT COUNT(*)::int AS n FROM products");
  if(c.rows[0].n===0){
    const seed=[
      ["Universal TV LED Backlight Strip","TV Parts","Replacement LED backlight strips for compatible TV models.",249,20,"📺"],
      ["TV Power Supply Board","TV Parts","Replacement power supply board. Confirm board/model number before ordering.",399,10,"🔌"],
      ["Smart TV Main Board","TV Parts","Main board replacement for selected Smart TV models.",699,8,"🖥️"],
      ["TV Remote Control","TV Parts","Universal replacement remote control.",149,30,"🎛️"],
      ["Universal LCD Display","Cellphone Parts","Replacement LCD display; compatibility must be confirmed.",499,15,"📱"],
      ["Cellphone Battery","Cellphone Parts","Replacement battery for compatible phone models.",199,25,"🔋"],
      ["USB-C Charging Port","Cellphone Parts","Replacement USB-C charging connector.",89,50,"🔧"],
      ["Phone Screen Adhesive","Cellphone Parts","Screen replacement adhesive.",59,60,"🧪"],
      ["SMD Capacitor Kit","Components","Assorted SMD capacitors for electronics repair.",179,20,"⚡"],
      ["IC Chip Assortment","Components","Assorted electronic ICs.",299,12,"🔬"],
      ["DC Power Connector Pack","Components","Common DC power connectors.",129,35,"🔗"],
      ["Precision Repair Tool Kit","Tools","Precision screwdriver and opening tool kit.",349,18,"🛠️"]
    ];
    for(const p of seed) await db("INSERT INTO products(name,category,description,price,stock,image) VALUES($1,$2,$3,$4,$5,$6)",p);
  }
}
function auth(req,res,next){if(!req.session.user)return res.redirect("/login?next="+encodeURIComponent(req.originalUrl));next()}
function admin(req,res,next){if(!req.session.admin)return res.status(403).send("Admin access required.");next()}
function money(n){return new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR"}).format(Number(n))}
function layoutData(extra={}){return {business:"Matt Technologies",currency:"ZAR",whatsapp:process.env.BUSINESS_WHATSAPP||"27XXXXXXXXX",...extra}}

app.get("/",async(req,res)=>{const r=await db("SELECT * FROM products WHERE active=true ORDER BY id DESC");res.render("home",layoutData({products:r.rows,user:req.session.user}))});
app.get("/shop",async(req,res)=>{const cat=req.query.category||"All";const q=req.query.q||"";const r=await db("SELECT * FROM products WHERE active=true AND ($1='All' OR category=$1) AND (LOWER(name) LIKE LOWER($2) OR LOWER(description) LIKE LOWER($2)) ORDER BY id DESC",[cat,"%"+q+"%"]);const cats=await db("SELECT DISTINCT category FROM products WHERE active=true ORDER BY category");res.render("shop",layoutData({products:r.rows,cats:cats.rows.map(x=>x.category),category:cat,q,user:req.session.user}))});
app.get("/product/:id",async(req,res)=>{const r=await db("SELECT * FROM products WHERE id=$1",[req.params.id]);if(!r.rowCount)return res.status(404).send("Product not found");res.render("product",layoutData({product:r.rows[0],user:req.session.user}))});

app.get("/register",(req,res)=>res.render("auth",layoutData({mode:"register",error:null})));
app.post("/register",async(req,res)=>{try{const {name,email,phone,password}=req.body;if(!name||!email||!password)return res.render("auth",layoutData({mode:"register",error:"Name, email and password are required."}));const hash=await bcrypt.hash(password,12);const r=await db("INSERT INTO customers(name,email,phone,password_hash) VALUES($1,$2,$3,$4) RETURNING id,name,email,phone",[name,email.toLowerCase(),phone||"",hash]);req.session.user=r.rows[0];res.redirect("/shop")}catch(e){res.render("auth",layoutData({mode:"register",error:"That email may already be registered."}))}});
app.get("/login",(req,res)=>res.render("auth",layoutData({mode:"login",error:null})));
app.post("/login",async(req,res)=>{const r=await db("SELECT * FROM customers WHERE email=$1",[String(req.body.email).toLowerCase()]);if(!r.rowCount||!(await bcrypt.compare(req.body.password,r.rows[0].password_hash)))return res.render("auth",layoutData({mode:"login",error:"Invalid email or password."}));const u=r.rows[0];req.session.user={id:u.id,name:u.name,email:u.email,phone:u.phone};res.redirect(req.query.next||"/shop")});
app.get("/logout",(req,res)=>{req.session=null;res.redirect("/")});

app.get("/checkout",auth,async(req,res)=>{const ids=(req.query.ids||"").split(",").filter(Boolean).map(Number);if(!ids.length)return res.redirect("/shop");const r=await db("SELECT * FROM products WHERE id=ANY($1::int[]) AND active=true",[ids]);res.render("checkout",layoutData({products:r.rows,user:req.session.user,error:null}))});
app.post("/checkout",auth,async(req,res)=>{
  const ids=(req.body.product_ids||"").split(",").filter(Boolean).map(Number);
  const qtys=String(req.body.quantities||"").split(",").map(Number);
  const pr=await db("SELECT * FROM products WHERE id=ANY($1::int[]) AND active=true",[ids]);
  if(!pr.rowCount)return res.redirect("/shop");
  let total=0,items=[];
  for(const p of pr.rows){const i=ids.indexOf(p.id),q=Math.max(1,qtys[i]||1);if(q>p.stock)return res.render("checkout",layoutData({products:pr.rows,user:req.session.user,error:`Not enough stock for ${p.name}. Available: ${p.stock}.`}));total+=Number(p.price)*q;items.push({...p,quantity:q})}
  const b=req.body;const o=await db("INSERT INTO orders(customer_id,customer_name,email,phone,address,city,postal_code,total,payment_method) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",[req.session.user.id,b.name,b.email,b.phone,b.address,b.city,b.postal_code,total,b.payment_method||"whatsapp"]);
  for(const i of items){await db("INSERT INTO order_items(order_id,product_id,name,quantity,unit_price) VALUES($1,$2,$3,$4,$5)",[o.rows[0].id,i.id,i.name,i.quantity,i.price]);await db("UPDATE products SET stock=stock-$1 WHERE id=$2",[i.quantity,i.id])}
  if(b.payment_method==="payfast" && process.env.PAYFAST_MERCHANT_ID){
    return res.render("payfast",layoutData({orderId:o.rows[0].id,total,user:req.session.user,merchantId:process.env.PAYFAST_MERCHANT_ID,merchantKey:process.env.PAYFAST_MERCHANT_KEY,passphrase:process.env.PAYFAST_PASSPHRASE||"",sandbox:process.env.PAYFAST_SANDBOX==="true"}));
  }
  res.redirect("/order/"+o.rows[0].id);
});
app.get("/order/:id",auth,async(req,res)=>{const o=await db("SELECT * FROM orders WHERE id=$1",[req.params.id]);if(!o.rowCount)return res.status(404).send("Order not found");const items=await db("SELECT * FROM order_items WHERE order_id=$1",[req.params.id]);res.render("order",layoutData({order:o.rows[0],items:items.rows,user:req.session.user}))});
app.get("/account",auth,async(req,res)=>{const r=await db("SELECT * FROM orders WHERE customer_id=$1 ORDER BY created_at DESC",[req.session.user.id]);res.render("account",layoutData({orders:r.rows,user:req.session.user}))});

app.post("/api/payfast/itn",express.urlencoded({extended:false}),async(req,res)=>{const id=req.body.m_payment_id;if(id)await db("UPDATE orders SET payment_status='paid',status='processing' WHERE id=$1",[id]);res.sendStatus(200)});
app.get("/checkout/success",(req,res)=>res.render("message",layoutData({title:"Payment received",message:"Thank you. Your payment provider has returned you to Matt Technologies. We will confirm your order shortly."})));
app.get("/checkout/cancel",(req,res)=>res.render("message",layoutData({title:"Payment cancelled",message:"Your payment was cancelled. Your order remains recorded; contact us if you need help."})));

app.get("/admin",admin,async(req,res)=>{const [p,o,c]=await Promise.all([db("SELECT * FROM products ORDER BY id DESC"),db("SELECT * FROM orders ORDER BY created_at DESC"),db("SELECT COUNT(*)::int AS n FROM customers")]);res.render("admin",layoutData({products:p.rows,orders:o.rows,customerCount:c.rows[0].n}))});
app.post("/admin/product",admin,async(req,res)=>{const b=req.body;await db("INSERT INTO products(name,category,description,price,stock,image) VALUES($1,$2,$3,$4,$5,$6)",[b.name,b.category,b.description,b.price,b.stock,b.image||"🧩"]);res.redirect("/admin")});
app.post("/admin/product/:id",admin,async(req,res)=>{const b=req.body;await db("UPDATE products SET name=$1,category=$2,description=$3,price=$4,stock=$5,active=$6 WHERE id=$7",[b.name,b.category,b.description,b.price,b.stock,b.active==="on",req.params.id]);res.redirect("/admin")});
app.post("/admin/order/:id",admin,async(req,res)=>{await db("UPDATE orders SET status=$1,payment_status=$2 WHERE id=$3",[req.body.status,req.body.payment_status,req.params.id]);res.redirect("/admin")});

(async()=>{await init();if(process.env.ADMIN_EMAIL&&process.env.ADMIN_PASSWORD)console.log("Admin configured via environment variables.");app.listen(PORT,()=>console.log("Matt Technologies store running on "+PORT));})().catch(e=>{console.error(e);process.exit(1)});
