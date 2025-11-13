import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Environment variables (with fallbacks for dev)
const RGS_ENDPOINT = process.env.RGS_ENDPOINT || 'https://script.google.com/macros/s/AKfycbxEXbM4sCQrxSc5vdyiZY-l2ReoWNY8-_QG_85bdeN55OKX2d2r0cWkCKTypcgMpQwk/exec';
const RGS_SECRET = process.env.RGS_SECRET;
const PUBLIC_KEY = process.env.PUBLIC_KEY || 'FRONTEND_KEY_ABC123';
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : ['https://ordertracking.royalgulfshipping.com', '*'];  // Prioritize domain, fallback *

console.log("Allowed Origins:", ALLOWED_ORIGINS, "Public Key exists:", !!PUBLIC_KEY);

// Parse JSON bodies
app.use(express.json());
app.use(express.static('public'));

// CORS: Function for dynamic check (handles same-domain + allowed)
app.use(cors({
  origin: (origin, callback) => {
    console.log('Request origin:', origin);  // Debug in Render logs
    if (!origin || ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.some(allowed => origin === allowed)) {
      callback(null, true);
    } else {
      console.warn('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));

// Explicit preflight
app.options("*", (req, res) => {
  res.sendStatus(204);
});

// POST /api/verify-recaptcha (unchanged)
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
  } catch (err) {
    console.error("reCAPTCHA verification failed:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /api/getShipment (unchanged—great filtering!)
app.get("/api/getShipment", async (req, res) => {
  try {
    const { ref, key } = req.query;
    if (!ref) return res.status(400).json({ error: "Missing ref parameter" });
    if (key !== PUBLIC_KEY) return res.status(403).json({ error: "Invalid public key" });

    const url = new URL(RGS_ENDPOINT);
    url.searchParams.set("secret", RGS_SECRET);
    url.searchParams.set("ref", ref);

    const rgsRes = await fetch(url.toString());
    if (!rgsRes.ok) {
      throw new Error(`GAS fetch failed: ${rgsRes.status}`);
    }
    const data = await rgsRes.json();

    const orders = data.orders || [];
    const logs = data.logs || [];

    let filteredOrders = orders.filter(order => order["Ref ID"] === ref);
    let isOrderRef = filteredOrders.length > 0;
    if (filteredOrders.length === 0) {
      filteredOrders = orders.filter(order => order["ConsignmentID"] === ref);
      isOrderRef = false;
    }
    if (filteredOrders.length === 0) {
      filteredOrders = orders.filter(order => order["ContainerTripID"] === ref);
      isOrderRef = false;
    }

    const consignmentID = filteredOrders.length > 0 ? filteredOrders[0]["ConsignmentID"] || '' : '';
    const containerIDs = [...new Set(filteredOrders.map(order => order['ContainerTripID']).filter(Boolean))];
    const orderRefs = isOrderRef ? [ref] : filteredOrders.map(order => order["Ref ID"]).filter(Boolean);
    const filteredLogs = logs.filter(log => {
      if (!log["Entity ID"] || !log.Sheet) return false;
      const entity = log["Entity ID"];
      const isOrder = log.Sheet === 'Orders' && orderRefs.includes(entity);
      const isContainer = log.Sheet === 'Containers' && containerIDs.includes(entity);
      const isConsignment = log.Sheet === 'Consignments' && entity === consignmentID;
      return isOrder || isContainer || isConsignment;
    });

    res.json({ orders: filteredOrders, logs: filteredLogs });
  } catch (err) {
    console.error("Error fetching shipment data:", err);
    res.status(500).json({ error: "Failed to fetch shipment data" });
  }
});

// Middleware to verify public key
const verifyPublicKey = (req, res, next) => {
  const clientKey = req.query.key || req.body.key;
  if (!clientKey || clientKey !== PUBLIC_KEY) {
    return res.status(403).json({ error: "Invalid or missing public key" });
  }
  next();
};

// Helper to build RGS URL
const buildRgsUrl = (params = {}) => {
  const url = new URL(RGS_ENDPOINT);
  url.searchParams.set("secret", RGS_SECRET);
  Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));
  return url.toString();
};

// POST /api/notify
app.post("/api/notify",  async (req, res) => {
  console.log('Incoming payload:', req.body);
  try {
    const body = req.body;
    const response = await fetch(RGS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`GAS POST failed: ${response.status}`);
    }
    const result = await response.json();
    console.log('GAS Response:', result);
    res.json(result);
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ success: false, error: "Failed to notify" });
  }
});

// Health check
app.get("/", (req, res) => {
  res.send("Shipment Tracker Backend is running!");
});

// Start server
app.listen(PORT, () => {
  console.log(`Shipment tracker backend running on port ${PORT}`);
});