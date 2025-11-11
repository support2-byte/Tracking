import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Environment variables
const RGS_ENDPOINT = process.env.RGS_ENDPOINT;
const RGS_SECRET = process.env.RGS_SECRET;
const PUBLIC_KEY = process.env.PUBLIC_KEY;
const ALLOWED_ORIGIN = "https://tracking-2yq6.onrender.com"; // no trailing slash
// Remove trailing slash
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET;
console.log("Allowed Origin:", ALLOWED_ORIGIN, "reCAPTCHA Secret:", RECAPTCHA_SECRET, "Public Key:", PUBLIC_KEY);
// Parse JSON bodies
app.use(express.json());
app.use(express.static('public'));
// CORS middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://tracking-2yq6.onrender.com");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  next();
});

// Respond to preflight
app.options("*", (req, res) => {
  res.sendStatus(204); // No Content
});

// POST /api/verify-recaptcha
app.post("/api/verify-recaptcha", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: "Missing token" });

    // Verify with Google
    const verifyURL = `https://www.google.com/recaptcha/api/siteverify?secret=${RECAPTCHA_SECRET}&response=${token}`;
    const response = await fetch(verifyURL, { method: "POST" });
    const data = await response.json();

    if (data.success) {
      return res.json({ success: true, message: "Verification successful" });
    } else {
      return res.status(400).json({ success: false, message: "Invalid reCAPTCHA", data });
    }
  } catch (err) {
    console.error("reCAPTCHA verification failed:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Example: GET shipment
app.get("/api/getShipment", async (req, res) => {
  try {
    const { ref, key } = req.query;
    if (!ref) return res.status(400).json({ error: "Missing ref parameter" });
    if (key !== PUBLIC_KEY) return res.status(403).json({ error: "Invalid public key" });

    const url = new URL(RGS_ENDPOINT);
    url.searchParams.set("secret", RGS_SECRET);
    url.searchParams.set("ref", ref);

    const rgsRes = await fetch(url.toString());
    const data = await rgsRes.json();

    const filteredOrders = (data.orders || []).filter(order => order["Ref ID"] === ref);
    res.json({ orders: filteredOrders });
  } catch (err) {
    console.error("Error fetching shipment data:", err);
    res.status(500).json({ error: "Failed to fetch shipment data" });
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


// ------------------ Health check ------------------
app.get("/", (req, res) => {
  res.send("Shipment Tracker Backend is running!");
});

// ------------------ Start server ------------------
app.listen(PORT, () => {
  console.log(`Shipment tracker backend running on port ${PORT}`);
});