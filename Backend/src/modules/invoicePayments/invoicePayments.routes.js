import express from "express";
import supabase from "../../config/db.js";
import { auth } from "../../middleware/auth.middleware.js";
import { applyAcademyFilter } from "../../middleware/academyFilter.js";

const router = express.Router();

function getRoleName(req) {
  return req.user?.role || req.user?.role_name || null;
}

function normalizeText(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text ? text : null;
}

function normalizeInteger(value, fieldName, { required = false, min = 1, max = null } = {}) {
  if (value === null || value === undefined || value === "") {
    if (required) {
      throw new Error(`${fieldName} is required`);
    }

    return null;
  }

  const numericValue = Number(value);

  if (!Number.isInteger(numericValue)) {
    throw new Error(`${fieldName} must be a whole number`);
  }

  if (numericValue < min) {
    throw new Error(`${fieldName} must be at least ${min}`);
  }

  if (max !== null && numericValue > max) {
    throw new Error(`${fieldName} must be at most ${max}`);
  }

  return numericValue;
}

function normalizeAmount(value, fieldName, { required = false } = {}) {
  if (value === null || value === undefined || value === "") {
    if (required) {
      throw new Error(`${fieldName} is required`);
    }

    return null;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    throw new Error(`${fieldName} must be a valid amount`);
  }

  return Number(numericValue.toFixed(2));
}

function resolveScopedAcademyId(value, req, { required = true } = {}) {
  const requestAcademyId = normalizeInteger(value, "academy_id", { required: false });
  const userAcademyId = normalizeInteger(req.user?.academy_id, "academy_id", { required: false });
  const roleName = getRoleName(req);

  if (roleName === "super_admin") {
    if (!requestAcademyId && required) {
      throw new Error("academy_id is required");
    }

    return requestAcademyId;
  }

  if (!userAcademyId && required) {
    throw new Error("academy_id is required");
  }

  if (requestAcademyId && userAcademyId && requestAcademyId !== userAcademyId) {
    const error = new Error("You cannot manage payments for another academy");
    error.statusCode = 403;
    throw error;
  }

  return userAcademyId;
}

function calculateInvoiceStatus({ totalAmount, paidAmount, currentStatus }) {
  if (currentStatus === "cancelled") {
    return "cancelled";
  }

  const total = Number(totalAmount || 0);
  const paid = Number(paidAmount || 0);

  if (paid <= 0) {
    return currentStatus === "draft" ? "draft" : "issued";
  }

  if (paid >= total) {
    return "paid";
  }

  return "partial";
}

function requiresProof(paymentMethod) {
  return ["cash", "upi", "bank_transfer"].includes(String(paymentMethod || "").toLowerCase());
}

function formatReceiptNumber(paymentId, paymentDate) {
  const date = paymentDate ? new Date(paymentDate) : new Date();
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("");

  return `AG-RCPT-${stamp}-${String(paymentId).padStart(5, "0")}`;
}

async function getScopedInvoice(invoiceId, req) {
  let query = supabase.from("invoices").select("*").eq("id", invoiceId);
  query = applyAcademyFilter(query, req);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function sumInvoicePayments(invoiceId) {
  const { data, error } = await supabase
    .from("invoice_payments")
    .select("amount_paid")
    .eq("invoice_id", invoiceId);

  if (error) {
    throw error;
  }

  return (data || []).reduce((sum, row) => sum + Number(row.amount_paid || 0), 0);
}

async function enrichPayments(payments) {
  const rows = payments || [];
  const invoiceIds = [...new Set(rows.map((row) => row.invoice_id).filter(Boolean))];
  const playerIds = [...new Set(rows.map((row) => row.player_id).filter(Boolean))];
  const academyIds = [...new Set(rows.map((row) => row.academy_id).filter(Boolean))];

  const [invoicesResponse, playersResponse, academiesResponse, receiptsResponse] = await Promise.all([
    invoiceIds.length
      ? supabase
          .from("invoices")
          .select("id,invoice_month,invoice_year,total_amount,status,due_date")
          .in("id", invoiceIds)
      : Promise.resolve({ data: [], error: null }),
    playerIds.length
      ? supabase.from("players").select("id,name").in("id", playerIds)
      : Promise.resolve({ data: [], error: null }),
    academyIds.length
      ? supabase.from("academies").select("id,name").in("id", academyIds)
      : Promise.resolve({ data: [], error: null }),
    rows.length
      ? supabase.from("invoice_receipts").select("*").in("payment_id", rows.map((row) => row.id))
      : Promise.resolve({ data: [], error: null })
  ]);

  if (invoicesResponse.error) throw invoicesResponse.error;
  if (playersResponse.error) throw playersResponse.error;
  if (academiesResponse.error) throw academiesResponse.error;
  if (receiptsResponse.error) throw receiptsResponse.error;

  const invoiceMap = new Map((invoicesResponse.data || []).map((invoice) => [String(invoice.id), invoice]));
  const playerMap = new Map((playersResponse.data || []).map((player) => [String(player.id), player.name]));
  const academyMap = new Map((academiesResponse.data || []).map((academy) => [String(academy.id), academy.name]));
  const receiptMap = new Map((receiptsResponse.data || []).map((receipt) => [String(receipt.payment_id), receipt]));

  return rows.map((payment) => {
    const invoice = invoiceMap.get(String(payment.invoice_id)) || null;
    const receipt = receiptMap.get(String(payment.id)) || null;

    return {
      ...payment,
      invoice,
      receipt,
      player_name: playerMap.get(String(payment.player_id)) || null,
      academy_name: academyMap.get(String(payment.academy_id)) || null,
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
    let query = supabase
      .from("invoice_payments")
      .select("*")
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false });
    query = applyAcademyFilter(query, req);

    const invoiceId = normalizeInteger(req.query.invoice_id, "invoice_id", { required: false });
    const playerId = normalizeInteger(req.query.player_id, "player_id", { required: false });

    if (invoiceId) query = query.eq("invoice_id", invoiceId);
    if (playerId) query = query.eq("player_id", playerId);

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(await enrichPayments(data || []));
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const invoiceId = normalizeInteger(req.body.invoice_id, "invoice_id", { required: true });
    const invoice = await getScopedInvoice(invoiceId, req);

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const academyId = resolveScopedAcademyId(req.body.academy_id ?? invoice.academy_id, req, { required: true });
    const paymentDate = normalizeText(req.body.payment_date) || new Date().toISOString().slice(0, 10);
    const amountPaid = normalizeAmount(req.body.amount_paid, "amount_paid", { required: true });
    const paymentMethod = normalizeText(req.body.payment_method);
    const referenceNumber = normalizeText(req.body.reference_number);
    const paymentProofUrl = normalizeText(req.body.payment_proof_url);
    const notes = normalizeText(req.body.notes);
    const receivedBy = normalizeInteger(req.user?.id, "received_by", { required: false });

    if (!paymentMethod) {
      throw new Error("payment_method is required");
    }

    if (requiresProof(paymentMethod) && !paymentProofUrl) {
      throw new Error("payment_proof_url is required for this payment method");
    }

    const paidBefore = await sumInvoicePayments(invoice.id);
    const totalAmount = Number(invoice.total_amount || 0);

    if (paidBefore >= totalAmount) {
      return res.status(409).json({ error: "Invoice is already fully paid" });
    }

    const remainingBalance = Number(Math.max(totalAmount - paidBefore, 0).toFixed(2));

    if (amountPaid > remainingBalance) {
      return res.status(400).json({
        error: `amount_paid exceeds remaining balance of Rs ${remainingBalance.toFixed(2)}`
      });
    }

    const { data: payment, error: paymentError } = await supabase
      .from("invoice_payments")
      .insert({
        academy_id: academyId,
        invoice_id: invoice.id,
        player_id: invoice.player_id,
        payment_date: paymentDate,
        amount_paid: amountPaid,
        payment_method: paymentMethod,
        reference_number: referenceNumber,
        payment_proof_url: paymentProofUrl,
        notes,
        received_by: receivedBy
      })
      .select("*")
      .single();

    if (paymentError) {
      return res.status(500).json({ error: paymentError.message });
    }

    const { data: receipt, error: receiptError } = await supabase
      .from("invoice_receipts")
      .insert({
        academy_id: academyId,
        invoice_id: invoice.id,
        payment_id: payment.id,
        receipt_number: formatReceiptNumber(payment.id, payment.payment_date),
        receipt_url: null
      })
      .select("*")
      .single();

    if (receiptError) {
      return res.status(500).json({ error: receiptError.message });
    }

    const totalPaid = Number((paidBefore + amountPaid).toFixed(2));
    const nextStatus = calculateInvoiceStatus({
      totalAmount,
      paidAmount: totalPaid,
      currentStatus: invoice.status
    });

    const { error: invoiceUpdateError } = await supabase
      .from("invoices")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString()
      })
      .eq("id", invoice.id);

    if (invoiceUpdateError) {
      return res.status(500).json({ error: invoiceUpdateError.message });
    }

    const [enrichedPayment] = await enrichPayments([{ ...payment, receipt }]);
    res.status(201).json(enrichedPayment);
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message });
  }
});

export default router;
