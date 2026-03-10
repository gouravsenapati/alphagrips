export function allowRoles(...roles){

return(req,res,next)=>{

const roleName = req.user?.role || req.user?.role_name;

if(!roles.includes(roleName))
return res.status(403).json({error:"Access denied"});

next();

};

}
