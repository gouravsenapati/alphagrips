export function tenantFilter(query, req) {

  if (req.tenant.role !== "super_admin") {
    return query.eq("academy_id", req.tenant.academy_id);
  }

  return query;
}