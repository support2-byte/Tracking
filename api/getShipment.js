import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON bodies
app.use(express.json());

// CORS for your frontend
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.get("/api/getShipment", async (req, res) => {
  try {
    const { ref, key } = req.query;

    if (!ref || !key) {
      return res.status(400).json({ error: "Missing ref or key" });
    }

    const url = new URL(process.env.RGS_ENDPOINT);
    url.searchParams.set("ref", ref);
    url.searchParams.set("key", key);

    const response = await fetch(url.toString());
    if (!response.ok) {
      return res.status(response.status).json({ error: `RGS API returned status ${response.status}` });
    }

  const orders = response.data.filter(o => o["Ref ID"] === ref);
  res.json({ orders });
  } catch (err) {
    console.error("Error fetching shipment data:", err);
    res.status(500).json({ error: "Failed to fetch shipment data" });
  }
});


// Proxy endpoint for notifications
app.post("/api/notify", async (req, res) => {
  try {
    const body = req.body;
    const response = await fetch(process.env.RGS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    res.json(result);
  } catch (err) {
    console.error("Error sending notification:", err);
    res.status(500).json({ error: "Failed to send notification" });
  }
});

app.listen(PORT, () => {
  console.log(`Shipment tracker backend running on port ${PORT}`);
});
