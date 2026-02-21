import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Razorpay from "razorpay";
import crypto from "crypto";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

/* ======================
   DEBUG LOGGING
====================== */

app.use((req,res,next)=>{
  console.log("REQUEST:", req.method, req.url);
  next();
});

/* ======================
   HEALTH CHECK
====================== */

app.get("/", (req,res)=>{
  res.send("AlphaGrips API Running");
});

app.get("/health",(req,res)=>{
  res.send("OK");
});


/* ======================
   SUPABASE
====================== */

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

/* ======================
   RAZORPAY
====================== */

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});


/* ======================
   AUTH LOGIN
====================== */

app.post("/login", async (req,res)=>{

const {email,password} = req.body;

const {data:user} = await supabase
.from("app_users")
.select("id,email,role,academy_id,is_active,password_hash")
.eq("email",email)
.eq("is_active",true)
.single();

if(!user)
return res.status(401).json({error:"Invalid credentials"});

const valid = await bcrypt.compare(password,user.password_hash);

if(!valid)
return res.status(401).json({error:"Invalid credentials"});

const token = jwt.sign(
{
id:user.id,
role:user.role,
academy_id:user.academy_id
},
process.env.JWT_SECRET,
{expiresIn:"8h"}
);

res.json({
token,
role:user.role,
academy_id:user.academy_id,
email:user.email
});

});


/* ======================
AUTH MIDDLEWARE
====================== */

function auth(req,res,next){

const header=req.headers.authorization;

if(!header)
return res.status(401).json({error:"No token"});

try{

const token=header.split(" ")[1];

req.user=jwt.verify(token,process.env.JWT_SECRET);

next();

}catch{

return res.status(401).json({error:"Invalid token"});

}

}


/* ======================
ROLE GUARD
====================== */

function allowRoles(...roles){

return(req,res,next)=>{

if(!roles.includes(req.user.role))
return res.status(403).json({error:"Access denied"});

next();

};

}


/* ======================
ACADEMY FILTER
====================== */

function applyAcademyFilter(query,req){

if(req.user.role!=="super_admin"){

return query.eq("academy_id",req.user.academy_id);

}

return query;

}


/* ======================
PLAYERS
====================== */

app.get("/players",auth,async(req,res)=>{

let query=supabase
.from("players")
.select(`
id,
name,
category_id,
academy_id,
is_active,
category:category_id(id,name),
academy:academy_id(id,name)
`)
.order("category_id")
.order("name");

query=applyAcademyFilter(query,req);

const {data,error}=await query;

if(error)
return res.status(500).json({error:error.message});

res.json(data);

});


/* ======================
CATEGORIES
====================== */

app.get("/categories",auth,async(req,res)=>{

let query=supabase
.from("category_master")
.select("*")
.order("display_order");

query=applyAcademyFilter(query,req);

const {data,error}=await query;

if(error)
return res.status(500).json({error:error.message});

res.json(data);

});


/* ======================
MATCHES INPUT
====================== */

app.get("/matches-input",auth,async(req,res)=>{

let query=supabase
.from("matches_input")
.select(`
id,
match_date,
score_raw,
academy_id,
player1:player1_id(id,name),
player2:player2_id(id,name)
`)
.order("match_date",{ascending:false});

query=applyAcademyFilter(query,req);

const {data,error}=await query;

if(error)
return res.status(500).json({error:error.message});

res.json(data);

});


/* ======================
RANKINGS
====================== */

app.get("/rankings",auth,async(req,res)=>{

let query=supabase
.from("player_rankings")
.select("*")
.order("category");

query=applyAcademyFilter(query,req);

const {data,error}=await query;

if(error)
return res.status(500).json({error:error.message});

res.json(data);

});


/* ======================
FINANCE DASHBOARD
====================== */

app.get("/finance-dashboard",auth,async(req,res)=>{

let academyId;

if(req.user.role==="super_admin")
academyId=Number(req.query.academy_id);
else
academyId=req.user.academy_id;

const {data,error}=await supabase.rpc(
"finance_summary",
{academy_id_input:academyId}
);

if(error)
return res.status(500).json({error:error.message});

res.json(data[0]||{});

});


/* ======================
CREATE ORDER
====================== */

app.post("/create-order",auth,async(req,res)=>{

try{

const {player_id,month}=req.body;

let academyId;

if(req.user.role==="super_admin")
academyId=Number(req.body.academy_id);
else
academyId=req.user.academy_id;


const {data:ledger}=await supabase.rpc(
"finance_monthly_ledger",
{academy_id_input:academyId}
);

const row=ledger.find(r=>
r.player_id===player_id &&
r.month.toString()===month
);

if(!row||row.pending<=0)
return res.status(400).json({error:"No pending amount"});


const order=await razorpay.orders.create({

amount:row.pending*100,
currency:"INR"

});


await supabase
.from("payments_log")
.insert([{

player_id,
academy_id:academyId,
payment_date:new Date().toISOString().split("T")[0],
amount:row.pending,
applied_month:month,
mode:"Online-Pending",
reference_no:order.id

}]);


res.json(order);

}catch(err){

console.log(err);

res.status(500).json({error:"Order failed"});

}

});


/* ======================
VERIFY PAYMENT
====================== */

app.post("/verify-payment",auth,async(req,res)=>{

try{

const{
razorpay_order_id,
razorpay_payment_id,
razorpay_signature
}=req.body;


const body=razorpay_order_id+"|"+razorpay_payment_id;


const expected=crypto
.createHmac("sha256",process.env.RAZORPAY_KEY_SECRET)
.update(body)
.digest("hex");


if(expected!==razorpay_signature)
return res.status(400).json({error:"Invalid signature"});


await supabase
.from("payments_log")
.update({

mode:"Online",
reference_no:razorpay_payment_id

})
.eq("reference_no",razorpay_order_id)
.eq("mode","Online-Pending");


res.json({status:"Payment Success"});

}catch{

res.status(500).json({error:"Verification failed"});

}

});


/* ======================
SERVER START
====================== */

const PORT=process.env.PORT;

console.log("PORT ENV =",PORT);

app.listen(PORT,"0.0.0.0",()=>{
console.log("Listening on",PORT);
});
