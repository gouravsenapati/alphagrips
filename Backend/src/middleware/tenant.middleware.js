export function tenantContext(req, res, next) {

  if (!req.user) {
    return next();
  }

  const roleName = req.user.role || req.user.role_name || null;

  req.tenant = {
    academy_id: req.user.academy_id,
    role: roleName
  };

  next();
}
