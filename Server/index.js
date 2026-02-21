import express from "express";

const app = express();

app.get("/", (req, res) => {
  res.send("AlphaGrips API Running");
});

app.get("/health", (req, res) => {
  res.send("OK");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
