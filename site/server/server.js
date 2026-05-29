"use strict";

require("dotenv").config();

const express     = require("express");
const cors        = require("cors");
const rateLimit   = require("express-rate-limit");
const fs          = require("fs");
const path        = require("path");
const crypto      = require("crypto");

// ---- config -----------------------------------------------------------------
const PORT            = parseInt(process.env.PORT || "8787", 10);
const API_KEY         = process.env.ANTHROPIC_API_KEY;
const MODEL_DEFAULT   = process.env.MODEL || "claude-sonnet-4-20250514";
const ROSTER_PATH     = path.resolve(__dirname, process.env.ROSTER_PATH || "../data/roster.json");
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",").map(s => s.trim()).filter(Boolean);
const RATE_LIMIT_RPM  = parseInt(process.env.RATE_LIMIT_RPM || "20", 10);

if (!API_KEY) {
  console.error("FATAL: ANTHROPIC_API_KEY is required");
  process.exit(1);
}

// ---- app --------------------------------------------------------------------
const app = express();
app.set("trust proxy", 1);                 // sitting behind Caddy/Cloudflare
app.use(express.json({ limit: "16kb" }));
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);    // curl / same-origin
    if (ALLOWED_ORIGINS.length === 0) return cb(null, true);   // dev: allow all
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error("origin not allowed: " + origin));
  }
}));

// ---- roster store: JSON file with atomic writes -----------------------------
fs.mkdirSync(path.dirname(ROSTER_PATH), { recursive: true });

function loadAll() {
  try { return JSON.parse(fs.readFileSync(ROSTER_PATH, "utf8")); }
  catch { return {}; }
}

function saveAll(data) {
  const tmp = ROSTER_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, ROSTER_PATH);          // atomic on POSIX
}

function sanitizeRoom(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32);
}

// ---- /api/oracle: Anthropic forwarder ---------------------------------------
// The client already constructs the prompt (in index.html's buildPrompt) and
// sends the same JSON shape it would send to api.anthropic.com. This server
// validates size, swaps in the API key, forwards, and returns the response.
const oracleLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: RATE_LIMIT_RPM,
  standardHeaders: true,
  legacyHeaders: false,
});

app.post("/api/oracle", oracleLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) return res.status(400).json({ error: "no messages" });

    const totalLen = messages.reduce((n, m) => n + String(m.content || "").length, 0);
    if (totalLen > 4000) return res.status(413).json({ error: "prompt too large" });

    const safeBody = {
      model:      body.model || MODEL_DEFAULT,
      max_tokens: Math.min(parseInt(body.max_tokens) || 300, 1000),
      messages,
    };

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type":      "application/json",
        "x-api-key":         API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(safeBody),
    });
    const text = await r.text();
    res.status(r.status).set("content-type", "application/json").send(text);
  } catch (err) {
    res.status(500).json({ error: "server", detail: String(err.message || err) });
  }
});

// ---- /api/roster/:room: shared list per room code ---------------------------
app.get("/api/roster/:room", (req, res) => {
  const room = sanitizeRoom(req.params.room);
  if (!room) return res.status(400).json({ error: "bad room" });
  // Roster is shared and changes constantly — never let a browser serve a
  // stale (e.g. empty) cached copy to a second visitor.
  res.set("Cache-Control", "no-store");
  res.json({ room, entries: loadAll()[room] || [] });
});

app.post("/api/roster/:room", (req, res) => {
  const room = sanitizeRoom(req.params.room);
  if (!room) return res.status(400).json({ error: "bad room" });

  const { name, title, creator } = req.body || {};
  if (!name || !title) return res.status(400).json({ error: "missing name or title" });
  if (String(title).length > 500) return res.status(400).json({ error: "title too long" });

  const all  = loadAll();
  const list = all[room] || [];
  if (list.length >= 200) return res.status(429).json({ error: "room full" });

  const entry = {
    id:      crypto.randomBytes(6).toString("hex"),
    name:    String(name).slice(0, 80),
    title:   String(title).slice(0, 500),
    creator: String(creator || "").slice(0, 64),   // opaque per-browser id; soft ownership
    ts:      Date.now(),
  };
  list.push(entry);
  all[room] = list;
  saveAll(all);
  res.json({ ok: true, count: list.length, entry });
});

app.delete("/api/roster/:room/:id", (req, res) => {
  const room = sanitizeRoom(req.params.room);
  const id   = String(req.params.id || "").slice(0, 32);
  if (!room || !id) return res.status(400).json({ error: "bad request" });

  const creator = String(req.query.creator || (req.body && req.body.creator) || "").slice(0, 64);
  const all    = loadAll();
  const list   = all[room] || [];
  const target = list.find(e => e.id === id);
  if (!target) return res.json({ ok: true, count: list.length });   // already gone
  // soft ownership: you may only delete entries you created
  if (target.creator && target.creator !== creator) {
    return res.status(403).json({ error: "not your entry" });
  }
  const next = list.filter(e => e.id !== id);
  all[room]  = next;
  saveAll(all);
  res.json({ ok: true, count: next.length });
});

// ---- health -----------------------------------------------------------------
app.get("/healthz", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// ---- start ------------------------------------------------------------------
app.listen(PORT, "127.0.0.1", () => {
  console.log(`crow-oracle listening on 127.0.0.1:${PORT}`);
});
