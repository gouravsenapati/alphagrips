import express from "express";

const app = express();

/* Required for Railway */
app.get("/", (req, res) => {
  res.status(200).send("AlphaGrips API Running");
});

/* Health route */
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

/* Important */
const PORT = process.env.PORT || 8080;

/* Critical: No host binding */
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
