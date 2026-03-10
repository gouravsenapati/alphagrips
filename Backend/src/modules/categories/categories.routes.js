import express from "express";
import supabase from "../../config/db.js";
import { auth } from "../../middleware/auth.middleware.js";
import { applyAcademyFilter } from "../../middleware/academyFilter.js";

const router = express.Router();

function getRoleName(req) {
  return req.user?.role || req.user?.role_name || null;
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
    const error = new Error("You cannot manage categories for another academy");
    error.statusCode = 403;
    throw error;
  }

  return userAcademyId;
}

function normalizeText(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text ? text : null;
}

function normalizeInteger(value, fieldName, { required = false } = {}) {
  if (value === null || value === undefined || value === "") {
    if (required) {
      throw new Error(`${fieldName} is required`);
    }

    return null;
  }

  const numericValue = Number(value);

  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return numericValue;
}

async function getScopedCategory(id, req) {
  let query = supabase.from("categories").select("*").eq("id", id);

  query = applyAcademyFilter(query, req);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function ensureCategoryNameAvailable({ academyId, name, excludeId = null }) {
  const { data, error } = await supabase
    .from("categories")
    .select("id,name")
    .eq("academy_id", academyId);

  if (error) {
    throw error;
  }

  const duplicate = (data || []).find(
    (category) =>
      String(category.id) !== String(excludeId || "") &&
      String(category.name || "").trim().toLowerCase() === name.toLowerCase()
  );

  if (duplicate) {
    const duplicateError = new Error("A category with this name already exists");
    duplicateError.statusCode = 409;
    throw duplicateError;
  }
}

router.get("/", auth, async (req, res) => {
  try {
    let query = supabase.from("categories").select("*").order("name");

    query = applyAcademyFilter(query, req);

    const { data: categories, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const academyIds = [...new Set((categories || []).map((item) => item.academy_id).filter(Boolean))];
    const categoryIds = [...new Set((categories || []).map((item) => item.id).filter(Boolean))];

    let academies = [];
    let players = [];

    if (academyIds.length) {
      const { data, error: academyError } = await supabase
        .from("academies")
        .select("id,name")
        .in("id", academyIds);

      if (academyError) {
        return res.status(500).json({ error: academyError.message });
      }

      academies = data || [];
    }

    if (categoryIds.length) {
      const { data, error: playerError } = await supabase
        .from("players")
        .select("id,category_id")
        .in("category_id", categoryIds);

      if (playerError) {
        return res.status(500).json({ error: playerError.message });
      }

      players = data || [];
    }

    const academyMap = new Map(academies.map((academy) => [String(academy.id), academy.name]));
    const playerCountMap = new Map();

    players.forEach((player) => {
      const key = String(player.category_id);
      playerCountMap.set(key, (playerCountMap.get(key) || 0) + 1);
    });

    res.json(
      (categories || []).map((category) => ({
        ...category,
        academy_name: academyMap.get(String(category.academy_id)) || null,
        player_count: playerCountMap.get(String(category.id)) || 0
      }))
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const academyId = resolveScopedAcademyId(req.body.academy_id, req, { required: true });
    const name = normalizeText(req.body.name);

    if (!name) {
      throw new Error("name is required");
    }

    await ensureCategoryNameAvailable({ academyId, name });

    const { data, error } = await supabase
      .from("categories")
      .insert({
        academy_id: academyId,
        name
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
    const existingCategory = await getScopedCategory(req.params.id, req);

    if (!existingCategory) {
      return res.status(404).json({ error: "Category not found" });
    }

    const academyId = resolveScopedAcademyId(
      req.body.academy_id ?? existingCategory.academy_id,
      req,
      { required: true }
    );
    const name = normalizeText(req.body.name);

    if (!name) {
      throw new Error("name is required");
    }

    await ensureCategoryNameAvailable({
      academyId,
      name,
      excludeId: existingCategory.id
    });

    const { data, error } = await supabase
      .from("categories")
      .update({
        academy_id: academyId,
        name
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
    const existingCategory = await getScopedCategory(req.params.id, req);

    if (!existingCategory) {
      return res.status(404).json({ error: "Category not found" });
    }

    const { count, error: playerCountError } = await supabase
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("category_id", existingCategory.id);

    if (playerCountError) {
      return res.status(500).json({ error: playerCountError.message });
    }

    if ((count || 0) > 0) {
      return res.status(409).json({
        error: "Cannot delete a category that still has registered players"
      });
    }

    const { error } = await supabase.from("categories").delete().eq("id", req.params.id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({
      success: true,
      deleted_category_id: existingCategory.id,
      deleted_category_name: existingCategory.name
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message });
  }
});

export default router;
