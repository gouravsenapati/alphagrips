import express from "express";
import supabase from "../../config/db.js";
import { auth } from "../../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", auth, async (req, res) => {

let query = supabase
.from("academies")
.select("id,name")
.order("name");

const roleName = req.user?.role || req.user?.role_name;

if (roleName !== "super_admin" && req.user?.academy_id) {
query = query.eq("id", req.user.academy_id);
}

const { data, error } = await query;

if (error)
return res.status(500).json({ error: error.message });

res.json(data);

});

export default router;
