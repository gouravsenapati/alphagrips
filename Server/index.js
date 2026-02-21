import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

/* ======================
   ENV CHECK
====================== */

console.log("ENV CHECK:");
console.log("SUPABASE_URL:", process.env.SUPABASE_URL ? "OK" : "MISSING");
console.log("SUPABASE_KEY:", process.env.SUPABASE_KEY ? "OK" : "MISSING");
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "OK" : "MISSING");


/* ======================
   TEST ROUTE
====================== */

app.get("/test", (req,res)=>{
 res.send("Server OK");
});


/* ======================
   STATIC FRONTEND
====================== */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve frontend
app.use(express.static(path.join(__dirname, "../")));

// Main route
app.get("/", (req, res) => {
 res.sendFile(path.join(__dirname, "../index.html"));
});


/* ======================
   START SERVER
====================== */

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
 console.log("Server running on port", PORT);
});
