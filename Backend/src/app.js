import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import routes from "./routes/index.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { tenantContext } from "./middleware/tenant.middleware.js";
import { env } from "./config/env.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../../Public");

/* ======================
   CORE MIDDLEWARE
====================== */

app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(
  "/Public",
  express.static(publicDir, {
    etag: false,
    lastModified: false,
    maxAge: 0,
    setHeaders(res) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Surrogate-Control", "no-store");
    }
  })
);

/* ======================
   DEBUG LOGGING
====================== */

if (env.NODE_ENV !== "production") {
  app.use((req,res,next)=>{
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });
}

/* ======================
   HEALTH CHECK
====================== */

app.get("/", (req,res)=>{
  res.redirect("/Public/index.html");
});

app.get("/health",(req,res)=>{
  res.send("OK");
});

/* ======================
   TENANT CONTEXT
====================== */

app.use(tenantContext);

/* ======================
   API ROUTES
====================== */

app.use("/api",routes);

/* ======================
   GLOBAL ERROR HANDLER
====================== */

app.use(errorHandler);

export default app;
