import express from "express";
import supabase from "../../config/db.js";
import { auth } from "../../middleware/auth.middleware.js";
import { applyAcademyFilter } from "../../middleware/academyFilter.js";

const router = express.Router();

router.get("/",auth,async(req,res)=>{

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

export default router;