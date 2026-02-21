import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Razorpay from "razorpay";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

/* ======================
 ENV CHECK
====================== */

console.log("ENV CHECK:");
console.log("SUPABASE_URL:", process.env.SUPABASE_URL ? "OK" : "MISSING");
console.log("SUPABASE_KEY:", process.env.SUPABASE_KEY ? "OK" : "MISSING");
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "OK" : "MISSING");
console.log("RAZORPAY_KEY_ID:", process.env.RAZORPAY_KEY_ID ? "OK" : "MISSING");
console.log("RAZORPAY_KEY_SECRET:", process.env.RAZORPAY_KEY_SECRET ? "OK" : "MISSING");


/* ======================
 EXPRESS
====================== */

const app = express();
app.use(cors());
app.use(express.json());


/* ======================
 PATH CONFIG
====================== */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


/* ======================
 STATIC FRONTEND
====================== */

app.use(express.static(path.join(__dirname, "../Client")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../Client/index.html"));
});


/* ======================
 TEST ROUTE
====================== */

app.get("/test",(req,res)=>{
 res.send("Server OK");
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

console.log("Using Razorpay key:",process.env.RAZORPAY_KEY_ID);


/* ======================
 AUTH LOGIN
====================== */

app.post("/login",async(req,res)=>{

 const {email,password}=req.body;

 const {data:user}=await supabase
 .from("app_users")
 .select("id,email,role,academy_id,is_active,password_hash")
 .eq("email",email)
 .eq("is_active",true)
 .single();

 if(!user) return res.status(401).json({error:"Invalid credentials"});

 const valid=await bcrypt.compare(password,user.password_hash);

 if(!valid) return res.status(401).json({error:"Invalid credentials"});

 const token=jwt.sign(
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

 if(!header) return res.status(401).json({error:"No token"});

 try{

 const token=header.split(" ")[1];

 req.user=jwt.verify(token,process.env.JWT_SECRET);

 next();

 }
 catch{

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

 if(error) return res.status(500).json({error:error.message});

 res.json(data);

});


/* ======================
 FINANCE LEDGER
====================== */

app.get("/finance-ledger",auth,async(req,res)=>{

 try{

 let academyId;

 if(req.user.role==="super_admin")
 academyId=Number(req.query.academy_id);
 else
 academyId=req.user.academy_id;

 const {data,error}=await supabase.rpc(
 "finance_monthly_ledger",
 {academy_id_input:academyId}
 );

 if(error)
 return res.status(500).json({error:error.message});

 res.json(data||[]);

 }
 catch{

 res.status(500).json({error:"Ledger failed"});

 }

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
 currency:"INR",
 receipt:`player_${player_id}_${month}`

 });

 await supabase.from("payments_log").insert([{

 player_id,
 academy_id:academyId,
 payment_date:new Date().toISOString().split("T")[0],
 amount:row.pending,
 applied_month:month,
 mode:"Online-Pending",
 reference_no:order.id

 }]);

 res.json(order);

 }
 catch(err){

 console.log(err);

 res.status(500).json({error:err.message});

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

 res.json({message:"Payment success"});

 }
 catch{

 res.status(500).json({error:"Verification failed"});

 }

});


/* ======================
 START SERVER
====================== */

const PORT=process.env.PORT||3000;

app.listen(PORT,()=>{

 console.log("Server running on port",PORT);

});
