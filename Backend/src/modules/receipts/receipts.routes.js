import express from "express";
import supabase from "../../config/db.js";
import { auth } from "../../middleware/auth.middleware.js";
import { applyAcademyFilter } from "../../middleware/academyFilter.js";

const router = express.Router();

function normalizeInteger(value, fieldName, { required = false, min = 1 } = {}) {
  if (value === null || value === undefined || value === "") {
    if (required) {
      throw new Error(`${fieldName} is required`);
    }

    return null;
  }

  const numericValue = Number(value);

  if (!Number.isInteger(numericValue) || numericValue < min) {
    throw new Error(`${fieldName} must be a whole number`);
  }

  return numericValue;
}

async function enrichReceipts(receipts) {
  const rows = receipts || [];
  const invoiceIds = [...new Set(rows.map((row) => row.invoice_id).filter(Boolean))];
  const paymentIds = [...new Set(rows.map((row) => row.payment_id).filter(Boolean))];
  const academyIds = [...new Set(rows.map((row) => row.academy_id).filter(Boolean))];

  const [invoiceResponse, paymentResponse, academyResponse] = await Promise.all([
    invoiceIds.length
      ? supabase.from("invoices").select("id,player_id,invoice_month,invoice_year,total_amount,status").in("id", invoiceIds)
      : Promise.resolve({ data: [], error: null }),
    paymentIds.length
      ? supabase.from("invoice_payments").select("id,amount_paid,payment_date,payment_method,player_id").in("id", paymentIds)
      : Promise.resolve({ data: [], error: null }),
    academyIds.length
      ? supabase.from("academies").select("id,name").in("id", academyIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (invoiceResponse.error) throw invoiceResponse.error;
  if (paymentResponse.error) throw paymentResponse.error;
  if (academyResponse.error) throw academyResponse.error;

  const playerIds = [
    ...new Set(
      [
        ...(invoiceResponse.data || []).map((row) => row.player_id),
        ...(paymentResponse.data || []).map((row) => row.player_id)
      ].filter(Boolean)
    )
  ];

  const playersResponse = playerIds.length
    ? await supabase.from("players").select("id,name").in("id", playerIds)
    : { data: [], error: null };

  if (playersResponse.error) throw playersResponse.error;

  const invoiceMap = new Map((invoiceResponse.data || []).map((row) => [String(row.id), row]));
  const paymentMap = new Map((paymentResponse.data || []).map((row) => [String(row.id), row]));
  const academyMap = new Map((academyResponse.data || []).map((row) => [String(row.id), row.name]));
  const playerMap = new Map((playersResponse.data || []).map((row) => [String(row.id), row.name]));

  return rows.map((receipt) => {
    const invoice = invoiceMap.get(String(receipt.invoice_id)) || null;
    const payment = paymentMap.get(String(receipt.payment_id)) || null;
    const playerId = payment?.player_id || invoice?.player_id || null;

    return {
      ...receipt,
      invoice,
      payment,
      academy_name: academyMap.get(String(receipt.academy_id)) || null,
      player_name: playerId ? playerMap.get(String(playerId)) || null : null,
      billing_label:
        invoice && invoice.invoice_month && invoice.invoice_year
          ? new Date(invoice.invoice_year, invoice.invoice_month - 1, 1).toLocaleDateString("en-IN", {
              month: "long",
              year: "numeric"
            })
          : null
    };
  });
}

router.get("/", auth, async (req, res) => {
  try {
    let query = supabase.from("invoice_receipts").select("*").order("created_at", { ascending: false });
    query = applyAcademyFilter(query, req);

    const invoiceId = normalizeInteger(req.query.invoice_id, "invoice_id", { required: false });
    if (invoiceId) {
      query = query.eq("invoice_id", invoiceId);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(await enrichReceipts(data || []));
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message });
  }
});

router.get("/:id", auth, async (req, res) => {
  try {
    let query = supabase.from("invoice_receipts").select("*").eq("id", req.params.id);
    query = applyAcademyFilter(query, req);

    const { data, error } = await query.maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: "Receipt not found" });
    }

    const [enrichedReceipt] = await enrichReceipts([data]);
    res.json(enrichedReceipt);
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message });
  }
});

export default router;
