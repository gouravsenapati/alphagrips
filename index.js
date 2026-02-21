import express from "express";

const app = express();

app.use((req,res,next)=>{
  console.log("REQUEST:", req.method, req.url);
  next();
});

app.get("/", (req, res) => {
  res.send("SERVER WORKING");
});

app.get("/health", (req, res) => {
  res.send("OK");
});

const PORT = process.env.PORT;

console.log("PORT ENV =", PORT);

app.listen(PORT, "0.0.0.0", () => {
  console.log("Listening on", PORT);
});
