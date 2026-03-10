export function applyAcademyFilter(query,req){

const roleName=req.user?.role || req.user?.role_name;

if(roleName!=="super_admin"){

return query.eq("academy_id",req.user.academy_id);

}

return query;

}
