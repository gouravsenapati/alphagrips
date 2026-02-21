import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import Razorpay from "razorpay";

dotenv.config();

console.log("=== ENV CHECK ===");
console.log("SUPABASE_URL:", process.env.SUPABASE_URL ? "OK" : "MISSING");
console.log("SUPABASE_KEY:", process.env.SUPABASE_KEY ? "OK" : "MISSING");
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "OK" : "MISSING");
console.log("RAZORPAY_KEY_ID:", process.env.RAZORPAY_KEY_ID ? "OK" : "MISSING");
console.log("=================");

const app = express();

app.use(cors());
app.use(express.json());

/* ROUTES */

app.get("/", (req, res) => {
  res.send("AlphaGrips Server Running");
});

app.get("/test", (req, res) => {
  res.send("Server OK");
});

app.get("/health", (req, res) => {
  res.send("OK");
});

/* SUPABASE */

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

/* RAZORPAY */

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* START SERVER */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
