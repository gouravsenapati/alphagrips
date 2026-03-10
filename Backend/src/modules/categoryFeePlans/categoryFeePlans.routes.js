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

  if (!Number.isFinite(numericValue) || numericValue < 0) {
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
    const error = new Error("You cannot manage fee plans for another academy");
    error.statusCode = 403;
    throw error;
  }

  return userAcademyId;
}

async function getScopedCategoryFeePlan(id, req) {
  let query = supabase.from("category_fee_plans").select("*").eq("id", id);
  query = applyAcademyFilter(query, req);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function getScopedCategory(categoryId, req, academyId) {
  let query = supabase.from("categories").select("*").eq("id", categoryId);

  if (getRoleName(req) === "super_admin") {
    query = query.eq("academy_id", academyId);
  } else {
    query = applyAcademyFilter(query, req);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function ensureUniqueCategoryFeePlan({ academyId, categoryId, excludeId = null }) {
  const { data, error } = await supabase
    .from("category_fee_plans")
    .select("id,category_id,status")
    .eq("academy_id", academyId)
    .eq("category_id", categoryId);

  if (error) {
    throw error;
  }

  const duplicate = (data || []).find(
    (plan) => String(plan.id) !== String(excludeId || "") && String(plan.status || "active") === "active"
  );

  if (duplicate) {
    const duplicateError = new Error("An active fee plan already exists for this category");
    duplicateError.statusCode = 409;
    throw duplicateError;
  }
}

router.get("/", auth, async (req, res) => {
  try {
    let query = supabase.from("category_fee_plans").select("*").order("created_at", { ascending: false });
    query = applyAcademyFilter(query, req);

    const { data: plans, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const academyIds = [...new Set((plans || []).map((plan) => plan.academy_id).filter(Boolean))];
    const categoryIds = [...new Set((plans || []).map((plan) => plan.category_id).filter(Boolean))];

    const [academiesResponse, categoriesResponse] = await Promise.all([
      academyIds.length
        ? supabase.from("academies").select("id,name").in("id", academyIds)
        : Promise.resolve({ data: [], error: null }),
      categoryIds.length
        ? supabase.from("categories").select("id,name").in("id", categoryIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (academiesResponse.error) {
      return res.status(500).json({ error: academiesResponse.error.message });
    }

    if (categoriesResponse.error) {
      return res.status(500).json({ error: categoriesResponse.error.message });
    }

    const academyMap = new Map((academiesResponse.data || []).map((academy) => [String(academy.id), academy.name]));
    const categoryMap = new Map((categoriesResponse.data || []).map((category) => [String(category.id), category.name]));

    res.json(
      (plans || []).map((plan) => ({
        ...plan,
        academy_name: academyMap.get(String(plan.academy_id)) || null,
        category_name: categoryMap.get(String(plan.category_id)) || null
      }))
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const academyId = resolveScopedAcademyId(req.body.academy_id, req, { required: true });
    const categoryId = normalizeInteger(req.body.category_id, "category_id", { required: true });
    const planName = normalizeText(req.body.plan_name);
    const amount = normalizeAmount(req.body.amount, "amount", { required: true });
    const billingCycle = normalizeText(req.body.billing_cycle) || "monthly";
    const dueDay = normalizeInteger(req.body.due_day, "due_day", { required: false, min: 1, max: 31 }) ?? 5;
    const graceDays = normalizeInteger(req.body.grace_days, "grace_days", { required: false, min: 0, max: 60 }) ?? 0;
    const status = normalizeText(req.body.status) || "active";
    const notes = normalizeText(req.body.notes);

    if (!planName) {
      throw new Error("plan_name is required");
    }

    const category = await getScopedCategory(categoryId, req, academyId);

    if (!category) {
      return res.status(404).json({ error: "Category not found for this academy" });
    }

    if (status === "active") {
      await ensureUniqueCategoryFeePlan({ academyId, categoryId });
    }

    const { data, error } = await supabase
      .from("category_fee_plans")
      .insert({
        academy_id: academyId,
        category_id: categoryId,
        plan_name: planName,
        amount,
        billing_cycle: billingCycle,
        due_day: dueDay,
        grace_days: graceDays,
        status,
        notes
      })
      .select("*")
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json(data);
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message });
  }
});

router.put("/:id", auth, async (req, res) => {
  try {
    const existingPlan = await getScopedCategoryFeePlan(req.params.id, req);

    if (!existingPlan) {
      return res.status(404).json({ error: "Fee plan not found" });
    }

    const academyId = resolveScopedAcademyId(
      req.body.academy_id ?? existingPlan.academy_id,
      req,
      { required: true }
    );
    const categoryId = normalizeInteger(req.body.category_id ?? existingPlan.category_id, "category_id", {
      required: true
    });
    const planName = normalizeText(req.body.plan_name);
    const amount = normalizeAmount(req.body.amount, "amount", { required: true });
    const billingCycle = normalizeText(req.body.billing_cycle) || existingPlan.billing_cycle || "monthly";
    const dueDay =
      normalizeInteger(req.body.due_day, "due_day", { required: false, min: 1, max: 31 }) ??
      existingPlan.due_day ??
      5;
    const graceDays =
      normalizeInteger(req.body.grace_days, "grace_days", { required: false, min: 0, max: 60 }) ??
      existingPlan.grace_days ??
      0;
    const status = normalizeText(req.body.status) || existingPlan.status || "active";
    const notes = normalizeText(req.body.notes);

    if (!planName) {
      throw new Error("plan_name is required");
    }

    const category = await getScopedCategory(categoryId, req, academyId);

    if (!category) {
      return res.status(404).json({ error: "Category not found for this academy" });
    }

    if (status === "active") {
      await ensureUniqueCategoryFeePlan({
        academyId,
        categoryId,
        excludeId: existingPlan.id
      });
    }

    const { data, error } = await supabase
      .from("category_fee_plans")
      .update({
        academy_id: academyId,
        category_id: categoryId,
        plan_name: planName,
        amount,
        billing_cycle: billingCycle,
        due_day: dueDay,
        grace_days: graceDays,
        status,
        notes
      })
      .eq("id", req.params.id)
      .select("*")
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    const existingPlan = await getScopedCategoryFeePlan(req.params.id, req);

    if (!existingPlan) {
      return res.status(404).json({ error: "Fee plan not found" });
    }

    const { count, error: invoiceError } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("category_fee_plan_id", existingPlan.id);

    if (invoiceError) {
      return res.status(500).json({ error: invoiceError.message });
    }

    if ((count || 0) > 0) {
      return res.status(409).json({
        error: "Cannot delete a fee plan that is already linked to invoices"
      });
    }

    const { error } = await supabase.from("category_fee_plans").delete().eq("id", existingPlan.id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({
      success: true,
      deleted_fee_plan_id: existingPlan.id,
      deleted_fee_plan_name: existingPlan.plan_name
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message });
  }
});

export default router;
