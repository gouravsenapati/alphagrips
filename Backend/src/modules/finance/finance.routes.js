import express from "express";
import supabase from "../../config/db.js";
import razorpay from "../../config/razorpay.js";
import { env, hasRazorpayConfig } from "../../config/env.js";
import crypto from "crypto";
import { auth } from "../../middleware/auth.middleware.js";

const router = express.Router();

router.get("/dashboard",auth,async(req,res)=>{

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

router.post("/create-order",auth,async(req,res)=>{

try{
if(!hasRazorpayConfig()||!razorpay)
return res.status(503).json({error:"Online payments are not configured"});

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

router.post("/verify-payment",auth,async(req,res)=>{

try{

const{
razorpay_order_id,
razorpay_payment_id,
razorpay_signature
}=req.body;

const body=razorpay_order_id+"|"+razorpay_payment_id;

const expected=crypto
.createHmac("sha256",env.RAZORPAY_KEY_SECRET)
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

export default router;
