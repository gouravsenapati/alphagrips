export function errorHandler(err,req,res,next){

console.error("ERROR:",err);

res.status(500).json({
error:err.message || "Internal server error"
});

}