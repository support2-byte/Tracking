import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const RGS_ENDPOINT = process.env.RGS_ENDPOINT;
const RGS_SECRET = process.env.RGS_SECRET;
const PUBLIC_KEY = process.env.PUBLIC_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET;

// Parse JSON bodies
app.use(express.json());
app.use(express.static("public"));

// CORS setup
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  next();
});

// ------------------ reCAPTCHA verification ------------------
app.post("/api/verify-recaptcha", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: "Missing token" });

    const verifyURL = `https://www.google.com/recaptcha/api/siteverify?secret=${RECAPTCHA_SECRET}&response=${token}`;
    const response = await fetch(verifyURL, { method: "POST" });
    const data = await response.json();

    if (data.success) {
      return res.json({ success: true, message: "Verification successful" });
    } else {
      return res.status(400).json({ success: false, message: "Invalid reCAPTCHA", data });
    }
  } catch (error) {
    console.error("reCAPTCHA verification failed:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ------------------ Middleware to verify public key ------------------
const verifyPublicKey = (req, res, next) => {
  const clientKey = req.query.key || req.body.key;
  if (!clientKey || clientKey !== PUBLIC_KEY) {
    return res.status(403).json({ error: "Invalid or missing public key" });
  }
  next();
};

// ------------------ Helper to build RGS URL ------------------
const buildRgsUrl = (params = {}) => {
  const url = new URL(RGS_ENDPOINT);
  url.searchParams.set("secret", RGS_SECRET);
  Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));
  return url.toString();
};

// ------------------ GET shipment data ------------------
app.get("/api/getShipment", verifyPublicKey, async (req, res) => {
  try {
    const { ref } = req.query;
    if (!ref) return res.status(400).json({ error: "Missing ref parameter" });

    const url = buildRgsUrl({ ref });
    const response = await fetch(url);
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`External API error: ${errText}`);
    }

    const data = await response.json();
    const filteredOrders = (data.orders || []).filter(order => order["Ref ID"] === ref);

    res.json({ orders: filteredOrders, logs: data.logs || [] });
  } catch (err) {
    console.error("Error fetching shipment data:", err);
    res.status(500).json({ error: "Failed to fetch shipment data" });
  }
});

// ------------------ POST notifications ------------------
app.post("/api/notify", verifyPublicKey, async (req, res) => {
  try {
    const payload = {
      ...req.body,
      key: PUBLIC_KEY,
      secret: RGS_SECRET
    };

    const rgsRes = await fetch(RGS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!rgsRes.ok) {
      const errText = await rgsRes.text();
      return res.status(rgsRes.status).json({ error: errText });
    }

    const result = await rgsRes.json();
    res.json(result);
  } catch (err) {
    console.error("Error sending notification:", err);
    res.status(500).json({ error: "Failed to send notification" });
  }
});

// ------------------ Health check ------------------
app.get("/", (req, res) => {
  res.send("Shipment Tracker Backend is running!");
});

// ------------------ Start server ------------------
app.listen(PORT, () => {
  console.log(`Shipment tracker backend running on port ${PORT}`);
});
