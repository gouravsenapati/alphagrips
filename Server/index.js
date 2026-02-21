import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Razorpay from "razorpay";
import crypto from "crypto";

dotenv.config();

console.log("ENV CHECK:");
console.log("SUPABASE_URL:", process.env.SUPABASE_URL ? "OK" : "MISSING");
console.log("SUPABASE_KEY:", process.env.SUPABASE_KEY ? "OK" : "MISSING");
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "OK" : "MISSING");
console.log("RAZORPAY_KEY_ID:", process.env.RAZORPAY_KEY_ID ? "OK" : "MISSING");
console.log("RAZORPAY_KEY_SECRET:", process.env.RAZORPAY_KEY_SECRET ? "OK" : "MISSING");

const app = express();
app.use(cors());
app.use(express.json());
app.get("/test", (req,res)=>{
res.send("Server OK");
});

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve frontend
app.use(express.static(path.join(__dirname, "../Client")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../Client/index.html"));
});

app.get("/", (req, res) => {
  res.send("AlphaGrips API Running");
});


const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});
console.log("Using Razorpay key:", process.env.RAZORPAY_KEY_ID);
/* ======================
   AUTH – LOGIN
====================== */
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const { data: user } = await supabase
    .from("app_users")
    .select("id,email,role,academy_id,is_active,password_hash")
    .eq("email", email)
    .eq("is_active", true)
    .single();

  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { id: user.id, role: user.role, academy_id: user.academy_id },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.json({
    token,
    role: user.role,
    academy_id: user.academy_id,
    email: user.email
  });
});

/* ======================
   AUTH MIDDLEWARE
====================== */
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "No token" });

  try {
    const token = header.split(" ")[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

/* ======================
   ROLE GUARD
====================== */
function allowRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role))
      return res.status(403).json({ error: "Access denied" });
    next();
  };
}

/* ======================
   ACADEMY FILTER
====================== */
function applyAcademyFilter(query, req) {
  if (req.user.role !== "super_admin") {
    return query.eq("academy_id", req.user.academy_id);
  }
  return query;
}

/* ======================
   CHANGE PASSWORD
====================== */
app.post("/change-password", auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const { data: user } = await supabase
    .from("app_users")
    .select("password_hash")
    .eq("id", req.user.id)
    .single();

  if (!user) return res.status(404).json({ error: "User not found" });

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid)
    return res.status(401).json({ error: "Current password incorrect" });

  const newHash = await bcrypt.hash(newPassword, 10);

  await supabase
    .from("app_users")
    .update({ password_hash: newHash })
    .eq("id", req.user.id);

  res.json({ status: "Password updated successfully" });
});

/* ======================
   CATEGORIES
====================== */
app.get("/categories", auth, async (req, res) => {
  let query = supabase
    .from("category_master")
    .select("*")
    .order("display_order");

  query = applyAcademyFilter(query, req);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json(data);
});

app.post(
  "/categories",
  auth,
  allowRoles("head_coach", "super_admin"),
  async (req, res) => {
    const academy_id =
      req.user.role === "super_admin"
        ? req.body.academy_id
        : req.user.academy_id;

    const { data, error } = await supabase
      .from("category_master")
      .insert([{ name: req.body.name, display_order: 999, academy_id }])
      .select();

    if (error) return res.status(500).json({ error: error.message });

    res.json(data[0]);
  }
);

/* ======================
   PLAYERS
====================== */
app.get("/players", auth, async (req, res) => {

  let query = supabase
    .from("players")
.select(`
  id,
  name,
  category_id,
  academy_id,
  is_active,
  category:category_id (
    id,
    name
  ),
  academy:academy_id (
    id,
    name
  )
`) 
   .order("category_id", { ascending: true })
    .order("name", { ascending: true });

  query = applyAcademyFilter(query, req);

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });

  res.json(data);
});

app.post(
  "/players",
  auth,
  allowRoles("head_coach", "super_admin"),
  async (req, res) => {
    const academy_id =
      req.user.role === "super_admin"
        ? req.body.academy_id
        : req.user.academy_id;

    const { data, error } = await supabase
      .from("players")
      .insert([{ ...req.body, academy_id }])
      .select();

    if (error) return res.status(500).json({ error: error.message });

    res.json(data[0]);
  }
);

app.put(
  "/players/:id",
  auth,
  allowRoles("head_coach", "super_admin"),
  async (req, res) => {
    let query = supabase
      .from("players")
      .update(req.body)
      .eq("id", req.params.id);

    query = applyAcademyFilter(query, req);

    const { data, error } = await query.select();
    if (error) return res.status(500).json({ error: error.message });

    res.json(data[0]);
  }
);

/* ======================
   MATCHES
====================== */
app.post(
  "/matches",
  auth,
  allowRoles("coach", "head_coach", "super_admin"),
  async (req, res) => {
    const academy_id =
      req.user.role === "super_admin"
        ? req.body.academy_id
        : req.user.academy_id;

    const { data, error } = await supabase
      .from("matches_input")
      .insert([{ ...req.body, academy_id }])
      .select();

    if (error) return res.status(500).json({ error: error.message });

    res.json(data[0]);
  }
);

app.get("/matches-input", auth, async (req, res) => {
  let query = supabase
    .from("matches_input")
    .select(`
      id,
      match_date,
      score_raw,
      academy_id,
      player1:player1_id (
        id,
        name
      ),
      player2:player2_id (
        id,
        name
      )
    `)
    .order("match_date", { ascending: false });

  query = applyAcademyFilter(query, req);

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });

  res.json(data);
});
/* ======================
   DELETE MATCH
====================== */
app.delete(
  "/matches/:id",
  auth,
  allowRoles("head_coach", "super_admin"),
  async (req, res) => {
    let inputQuery = supabase
      .from("matches_input")
      .select("*")
      .eq("id", req.params.id);

    inputQuery = applyAcademyFilter(inputQuery, req);

    const { data: input, error } = await inputQuery.single();
    if (!input || error)
      return res.status(404).json({ error: "Match not found" });

    await supabase
      .from("matches_final")
      .delete()
      .eq("match_date", input.match_date)
      .eq("player1", input.player1)
      .eq("player2", input.player2)
      .eq("score_raw", input.score_raw)
      .eq("academy_id", input.academy_id);

    await supabase
      .from("matches_input")
      .delete()
      .eq("id", req.params.id);

    res.json({ status: "Match deleted successfully" });
  }
);

/* ======================
   RANKINGS
====================== */
app.get("/rankings", auth, async (req, res) => {
  let query = supabase
    .from("player_rankings")
.select("*")
.order("category", { ascending: true });

  query = applyAcademyFilter(query, req);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json(data);
});

/* ======================
Categories CRUD (HEAD COACH + SUPER ADMIN)
====================== */

app.put(
  "/categories/:id",
  auth,
  allowRoles("head_coach", "super_admin"),
  async (req, res) => {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("category_master")
      .update(req.body)
      .eq("id", id)
      .select();

    if (error) return res.status(400).json({ error: error.message });

    res.json(data[0]);
  }
);

/* ======================
   MATRIX
====================== */
app.get("/matrix-dates", auth, async (req, res) => {
  let query = supabase
    .from("matches_final")
    .select("match_date");

  query = applyAcademyFilter(query, req);

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });

  if (!data) return res.json([]);

  res.json([...new Set(data.map(d => d.match_date))]);
});

app.get("/matrix-categories", auth, async (req, res) => {
  let query = supabase
    .from("matches_final")
    .select(`
      player1:player1_id (
        category:category_id (
          id,
          name
        )
      )
    `)
    .eq("match_date", req.query.date);

  query = applyAcademyFilter(query, req);

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json([]);

  const categories = [
    ...new Map(
      data
        .filter(d => d.player1?.category)
        .map(d => [
          d.player1.category.id,
          {
            id: d.player1.category.id,
            name: d.player1.category.name
          }
        ])
    ).values()
  ];

  res.json(categories);
});


app.get("/matrix", auth, async (req, res) => {
  let query = supabase
    .from("matches_final")
    .select(`
      match_date,
      player1_id,
      player2_id,
      winner_id,
      result_p1,
      result_p2,
      player1:player1_id ( id, name ),
      player2:player2_id ( id, name )
    `)
    .eq("match_date", req.query.date)
    .eq("category_id", req.query.category);

  query = applyAcademyFilter(query, req);

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });

  res.json(data || []);
});
/* ======================
   USERS (SUPER ADMIN)
====================== */
app.get("/users", auth, allowRoles("super_admin"), async (req, res) => {
  const { data } = await supabase
    .from("app_users")
    .select("id,email,role,academy_id,is_active")
    .order("email");

  res.json(data);
});

app.post("/users", auth, allowRoles("super_admin"), async (req, res) => {
  const { email, password, role, academy_id } = req.body;

  const password_hash = await bcrypt.hash(password, 10);

  const { data, error } = await supabase
    .from("app_users")
    .insert([
      {
        email,
        password_hash,
        role,
        academy_id: role === "super_admin" ? null : academy_id,
        is_active: true
      }
    ])
    .select();

  if (error) return res.status(400).json({ error: error.message });

  res.json(data[0]);
});

app.put("/users/:id", auth, allowRoles("super_admin"), async (req, res) => {
  const { id } = req.params;
  const { role, academy_id, is_active } = req.body;

  const { data, error } = await supabase
    .from("app_users")
    .update({
      role,
      academy_id: role === "super_admin" ? null : academy_id,
      is_active
    })
    .eq("id", id)
    .select();

  if (error) return res.status(400).json({ error: error.message });

  res.json(data[0]);
});

app.delete("/users/:id", auth, allowRoles("super_admin"), async (req, res) => {
  if (req.user.id === req.params.id)
    return res.status(400).json({ error: "You cannot delete yourself" });

  const { error } = await supabase
    .from("app_users")
    .delete()
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ status: "User deleted successfully" });
});

/* ======================
   ACADEMIES
====================== */
app.get("/academies", auth, allowRoles("super_admin"), async (req, res) => {
  const { data } = await supabase
    .from("academy")
    .select("id,name")
    .order("id");

  res.json(data);
});




/* ======================
   Finance (TO BE IMPLEMENTED)
====================== */

app.get("/finance-dashboard", auth, async (req, res) => {
  try {

    let academyId;

    if (req.user.role === "super_admin") {
      academyId = req.query.academy_id;

      if (!academyId) {
        return res.status(400).json({
          error: "academy_id required for super admin"
        });
      }

      academyId = Number(academyId);
    } else {
      academyId = req.user.academy_id;
    }

    const summaryRes = await supabase.rpc("finance_summary", {
      academy_id_input: academyId
    });

    const monthlyRes = await supabase.rpc("finance_monthly", {
      academy_id_input: academyId
    });

    const efficiencyRes = await supabase.rpc("finance_collection_efficiency", {
      academy_id_input: academyId
    });

    const defaultersRes = await supabase.rpc("finance_top_defaulters", {
      academy_id_input: academyId
    });

    if (
      summaryRes.error ||
      monthlyRes.error ||
      efficiencyRes.error ||
      defaultersRes.error
    ) {
      console.log(
        summaryRes.error ||
        monthlyRes.error ||
        efficiencyRes.error ||
        defaultersRes.error
      );
      return res.status(500).json({ error: "Dashboard query failed" });
    }

    res.json({
      summary: summaryRes.data[0] || {},
      monthlyTrend: monthlyRes.data || [],
      collectionEfficiency: efficiencyRes.data || [],
      topDefaulters: defaultersRes.data || []
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Finance dashboard failed" });
  }
});

//Ledger
app.get("/finance-ledger", auth, async (req, res) => {
  try {

    let academyId;

    if (req.user.role === "super_admin") {
      academyId = Number(req.query.academy_id);
    } else {
      academyId = req.user.academy_id;
    }

    const { data, error } = await supabase.rpc(
      "finance_monthly_ledger",
      { academy_id_input: academyId }
    );

    if (error) return res.status(500).json({ error: error.message });

    res.json(data || []);

  } catch {
    res.status(500).json({ error: "Ledger fetch failed" });
  }
});


//ADD Payment

app.post("/finance-payment", auth, async (req, res) => {
  try {

    const { player_id, payment_date, amount, month, remarks } = req.body;

    if (!player_id || !payment_date || !amount || !month) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const academyId =
      req.user.role === "super_admin"
        ? Number(req.body.academy_id)
        : req.user.academy_id;

    const { data, error } = await supabase
      .from("payments_log")
      .insert([{
        player_id,
        academy_id: academyId,
        payment_date,
        amount,
        month,
        remarks
      }])
      .select();

    if (error) return res.status(500).json({ error: error.message });

    res.json(data[0]);

  } catch {
    res.status(500).json({ error: "Payment failed" });
  }
});



//Payment History

app.get("/finance-payments", auth, async (req, res) => {
  try {

    let academyId;

    if (req.user.role === "super_admin") {
      academyId = Number(req.query.academy_id);
    } else {
      academyId = req.user.academy_id;
    }

    const { data, error } = await supabase
      .from("payments_log")
      .select(`
  id,
  payment_date,
  applied_month,
  amount,
  mode,
  reference_no,
  player:player_id (
    id,
    name
  )
`)
      .eq("academy_id", academyId)
      .order("payment_date", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    res.json(data || []);

  } catch {
    res.status(500).json({ error: "Failed to load payments" });
  }
});

//Delete Payment

app.delete("/finance-payment/:id", auth, async (req, res) => {
  try {

    if (req.user.role !== "super_admin") {
      return res.status(403).json({ error: "Only super admin can delete payments" });
    }

    const { error } = await supabase
      .from("payments_log")
      .delete()
      .eq("id", req.params.id);

    if (error) return res.status(500).json({ error: error.message });

    res.json({ status: "Payment deleted" });

  } catch {
    res.status(500).json({ error: "Delete failed" });
  }
});



//fees

app.get("/finance-fees", auth, async (req, res) => {
  try {

    let academyId;

    if (req.user.role === "super_admin") {
      academyId = Number(req.query.academy_id);
    } else {
      academyId = req.user.academy_id;
    }

    const { data, error } = await supabase
      .from("category_fees")
      .select(`
        id,
        monthly_fee,
        effective_from,
        is_active,
        category:category_id (
          id,
          name
        )
      `)
      .eq("academy_id", academyId)
      .order("effective_from", { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data || []);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load fee structure" });
  }
});



//Player-fee mapping
app.get("/finance-player-fees", auth, allowRoles("super_admin"), async (req, res) => {
  try {
    const academyId = Number(req.query.academy_id);

    if (!academyId) {
      return res.status(400).json({ error: "academy_id required" });
    }

    const { data: players, error: playersError } = await supabase
  .from("players")
  .select(`
    id,
    name,
    is_active,
    category:category_id (
      id,
      name
    )
  `)
  .eq("academy_id", academyId)
  .order("name");

    if (playersError) {
      return res.status(500).json({ error: playersError.message });
    }

    const { data: fees, error: feeError } = await supabase
      .from("player_fee_master")
      .select("player_id, court_fee, shuttle_fee, total_fee")
      .eq("academy_id", academyId)
      .eq("is_current", true);

    if (feeError) {
      return res.status(500).json({ error: feeError.message });
    }

    const result = players.map(p => {
      const fee = fees.find(f => f.player_id === p.id);
      return {
  player_id: p.id,
  name: p.name,
  category_name: p.category?.name || "",
  is_active: p.is_active,
  court_fee: fee?.court_fee || null,
  shuttle_fee: fee?.shuttle_fee || null,
  total_fee: fee?.total_fee || null
};
    });

    res.json(result);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch player fees" });
  }
});

app.post("/finance-player-fee/:id", auth, allowRoles("super_admin"), async (req, res) => {
  try {
    const playerId = Number(req.params.id);
    const { court_fee, shuttle_fee, total_fee, academy_id } = req.body;

    if (!academy_id) {
      return res.status(400).json({ error: "academy_id required" });
    }

    // Expire old record
    await supabase
      .from("player_fee_master")
      .update({
        effective_to: new Date().toISOString().split("T")[0],
        is_current: false
      })
      .eq("player_id", playerId)
      .eq("academy_id", academy_id)
      .eq("is_current", true);

    // Insert new record
    const { error } = await supabase
      .from("player_fee_master")
      .insert([{
        player_id: playerId,
        court_fee,
        shuttle_fee,
        total_fee,
        effective_from: new Date().toISOString().split("T")[0],
        is_current: true,
        academy_id
      }]);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ message: "Fee updated successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update fee" });
  }
});



/* ======================
Finance Endpoints (TO BE IMPLEMENTED)
====================== */



/* ======================
   Razorpay Webhooks (TO BE IMPLEMENTED)
====================== */

app.post("/create-order", auth, async (req, res) => {
  try {

    const { player_id, month } = req.body;

    const academyId =
      req.user.role === "super_admin"
        ? Number(req.body.academy_id)
        : req.user.academy_id;

    const { data: ledger, error } = await supabase.rpc(
      "finance_monthly_ledger",
      { academy_id_input: academyId }
    );

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!ledger) {
      return res.status(500).json({ error: "Ledger not found" });
    }

    const row = ledger.find(r =>
      r.player_id === player_id &&
      r.month.toString() === month
    );

    if (!row || row.pending <= 0) {
      return res.status(400).json({ error: "No pending amount" });
    }

    const order = await razorpay.orders.create({
      amount: row.pending * 100,
      currency: "INR",
      receipt: `player_${player_id}_${month}`,
    });

    await supabase.from("payments_log").insert([{
      player_id,
      academy_id: academyId,
      payment_date: new Date().toISOString().split("T")[0],
      amount: row.pending,
      applied_month: month,
      mode: "Online-Pending",
      reference_no: order.id
    }]);

    res.json(order);

  } catch (err) {
    console.error("Create Order Error:", err);
    res.status(500).json({ error: err.message });
  }
});




app.post("/verify-payment", auth, async (req, res) => {
  try {

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    // Update pending record
    const { error } = await supabase
      .from("payments_log")
      .update({
        mode: "Online",
        reference_no: razorpay_payment_id
      })
      .eq("reference_no", razorpay_order_id)
      .eq("mode", "Online-Pending");

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ message: "Payment successful" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Verification failed" });
  }
});






/* ======================
   Razorpay Webhooks (TO BE IMPLEMENTED)
====================== */

/* ======================
   STATIC FRONTEND
====================== */

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve frontend
app.use(express.static(path.join(__dirname, "../")));

// Default route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../index.html"));
});


/* ======================
   TEST ROUTE
====================== */

app.get("/test", (req,res)=>{
 res.send("Server OK");
});


/* ======================
   START SERVER
====================== */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
 console.log(`Server running on port ${PORT}`);
});
