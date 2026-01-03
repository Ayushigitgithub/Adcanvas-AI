// server.js (project root)
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");
const { model } = require("./geminiClient");

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

const PORT = process.env.PORT || 5001;

app.use(express.json({ limit: "1mb" }));

/** ---------------- Origin normalization ---------------- **/
function normalizeUrl(u) {
  if (!u) return "";
  return String(u).trim().replace(/\/+$/, ""); // remove trailing slashes
}

/**
 * Railway Variables:
 * FRONTEND_ORIGIN=https://storied-licorice-5a97b4.netlify.app
 * (comma-separated if multiple)
 */
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map(normalizeUrl)
  .filter(Boolean);

function isAllowedOrigin(origin) {
  const o = normalizeUrl(origin);
  return !!o && allowedOrigins.includes(o);
}

function isAllowedReferer(referer) {
  const r = String(referer || "").trim();
  if (!r) return false;

  // allow if referer starts with allowedOrigin + "/"
  return allowedOrigins.some((o) => r.startsWith(o + "/"));
}

/** ---------------- CORS (no throwing) ---------------- **/
app.use(
  cors({
    origin: (origin, cb) => {
      // During initial setup, if allowlist missing, allow
      if (allowedOrigins.length === 0) return cb(null, true);

      // Block non-browser/no-origin calls for API safety
      // (Health still works because it doesn't require CORS)
      if (!origin) return cb(null, false);

      if (isAllowedOrigin(origin)) return cb(null, true);

      console.log("🚫 CORS blocked:", origin, "allowed:", allowedOrigins);
      return cb(null, false); // IMPORTANT: do not throw Error (prevents 500 HTML)
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.options("*", cors());

/** ---------------- Health ---------------- **/
app.get("/health", (req, res) => res.json({ ok: true }));

/** ---------------- API gate (blocks Postman/bots) ---------------- **/
app.use("/api", (req, res, next) => {
  if (req.method === "OPTIONS") return next();

  // Don't lock yourself out if allowlist isn't configured yet
  if (allowedOrigins.length === 0) return next();

  const origin = req.get("origin") || "";
  const referer = req.get("referer") || "";

  // Hard block no-origin + no-referer (Postman/curl/bots)
  if (!origin && !referer) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const ok =
    (origin && isAllowedOrigin(origin)) ||
    (referer && isAllowedReferer(referer));

  if (!ok) {
    return res.status(403).json({ error: "Forbidden" });
  }

  next();
});

/** ---------------- Rate limit (Gemini endpoint only) ---------------- **/
const generateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Generate limit reached. Try again in 15 minutes." },
});

app.post("/api/generate-copy", generateLimiter, async (req, res) => {
  const meta = req.body?.campaign
    ? {
        platform: req.body.campaign?.platform,
        objective: req.body.campaign?.objective,
        sizePreset: req.body.creative?.sizePreset,
      }
    : {
        platform: req.body?.platform,
        objective: req.body?.objective,
        sizePreset: req.body?.sizePreset,
      };

  console.log("🔵 POST /api/generate-copy meta:", meta);

  let platform,
    objective,
    tone,
    templateId,
    templateName,
    hasCTA,
    brandName,
    primaryColor,
    layout,
    sizePreset,
    cta,
    headline,
    subcopy,
    offerLine,
    legalLine;

  if (req.body.campaign) {
    const c = req.body.campaign || {};
    const cr = req.body.creative || {};

    platform = c.platform;
    objective = c.objective;
    tone = c.tone;
    templateId = c.templateId;
    templateName = c.templateName;
    hasCTA = Boolean(c.hasCTA);
    brandName = c.brandName;
    primaryColor = c.primaryColor;

    layout = cr.layout;
    sizePreset = cr.sizePreset;
    cta = cr.cta;
    headline = cr.headline;
    subcopy = cr.subcopy;
    offerLine = cr.offerLine;
    legalLine = cr.legalLine;
  } else {
    platform = req.body.platform;
    objective = req.body.objective;
    tone = req.body.tone;
    templateId = req.body.templateId;
    templateName = req.body.templateName;
    hasCTA = Boolean(req.body.hasCTA);
    brandName = req.body.brandName;
    primaryColor = req.body.primaryColor;

    layout = req.body.layout;
    sizePreset = req.body.sizePreset;
    cta = req.body.cta;
    headline = req.body.headline;
    subcopy = req.body.subcopy;
    offerLine = req.body.offerLine;
    legalLine = req.body.legalLine;
  }

  /** ---------- helpers ---------- **/
  function stripCodeFences(s) {
    let text = String(s || "").trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
    }
    return text;
  }
  function extractFirstJsonObject(text) {
    const s = stripCodeFences(text);
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    return s.slice(start, end + 1);
  }
  function normalizeWhitespace(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }
  function clampWords(s, maxWords) {
    const words = String(s || "").trim().split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return String(s || "").trim();
    return words.slice(0, maxWords).join(" ").trim();
  }
  function isBadTescoClaim(str) {
    const t = (str || "").toLowerCase();
    const banned = [
      "% off",
      "percent off",
      "sale",
      "discount",
      "deal",
      "offer ends",
      "limited offer",
      "₹",
      "$",
      "€",
      "£",
      "cashback",
      "free gift",
      "win",
      "prize",
      "contest",
      "giveaway",
      "donate",
      "donation",
      "charity",
      "sustainable",
      "eco-friendly",
      "carbon",
      "green",
    ];
    return banned.some((w) => t.includes(w));
  }
  function pickBadgeFallback({ objective }) {
    const o = (objective || "").toLowerCase();
    if (o.includes("awareness")) return "New in";
    if (o.includes("consideration")) return "Explore the range";
    if (o.includes("conversion")) return "Browse range";
    return "New in";
  }
  function pickLayoutForPreset({ sizePreset }) {
    const s = String(sizePreset || "").toLowerCase();
    if (s.includes("story") || s.includes("portrait") || s.includes("9x16") || s.includes("reels") || s.includes("shorts")) {
      return "center-packshot";
    }
    return "left-packshot";
  }

  try {
    const prompt = `
You are an ad copy assistant for Tesco Retail Media self-serve creatives.

Hard rules:
- NO prices, NO discounts, NO "% off", NO "sale", NO "deal" language.
- NO sustainability/green claims, NO charity/donation messaging, NO competitions/prizes.
- Neutral, brand-safe tone. Avoid exaggerated superlatives.
- Headline max 8 words.
- Supporting line: one sentence only.
- If CTA is allowed, CTA must be neutral: one of ["View details","Learn more","See more","Browse range"].
- Layout must be one of: ["left-packshot","right-packshot","center-packshot"].
- "offerLine" is NOT a price/offer. Treat it as a small neutral badge (2–4 words).

Inputs:
Brand: ${brandName || "Your brand"}
Platform: ${platform || "unspecified"}
Objective: ${objective || "unspecified"}
Tone: ${tone || "Bold & modern"}
Template: ${templateName || templateId || "unknown"}
CTA allowed: ${hasCTA ? "YES" : "NO"}
Primary colour: ${primaryColor || "#2563eb"}
Current layout: ${layout || "not specified"}
Size preset: ${sizePreset || "unknown"}
Current headline: ${headline || ""}
Current supporting line: ${subcopy || ""}
Current CTA: ${cta || ""}
Current badge (offerLine): ${offerLine || ""}
Current legal line: ${legalLine || ""}

Return ONLY JSON with exactly these keys:
{
  "headline": "string",
  "subcopy": "string",
  "cta": "string (empty if CTA not allowed)",
  "offerLine": "string (2–4 words badge, can be empty)",
  "legalLine": "string (very short, can be empty)",
  "layout": "left-packshot OR right-packshot OR center-packshot",
  "alerts": ["brief notes"]
}
Output JSON only. No markdown. No extra text.
    `.trim();

    const result = await model.generateContent(prompt);
    const raw = result?.response?.text?.() || "";
    const jsonText = extractFirstJsonObject(raw);

    let ai = null;
    if (jsonText) {
      try { ai = JSON.parse(jsonText); } catch (_) { ai = null; }
    }

    const alerts = Array.isArray(ai?.alerts) ? ai.alerts.slice(0, 6) : [];

    let outHeadline = clampWords(normalizeWhitespace(ai?.headline || headline || ""), 8);
    let outSubcopy = normalizeWhitespace(ai?.subcopy || subcopy || "");

    const allowedCTAs = new Set(["View details", "Learn more", "See more", "Browse range"]);
    let outCTA = normalizeWhitespace(ai?.cta || "");
    if (!hasCTA) outCTA = "";
    if (hasCTA && !allowedCTAs.has(outCTA)) {
      outCTA = cta && allowedCTAs.has(cta) ? cta : "View details";
      alerts.push("CTA adjusted to a Tesco-safe neutral option.");
    }

    let outOffer = normalizeWhitespace(ai?.offerLine ?? "");
    if (!outOffer) {
      outOffer = pickBadgeFallback({ objective });
      alerts.push("Badge auto-filled with a Tesco-safe highlight.");
    }
    outOffer = clampWords(outOffer, 4);

    let outLegal = normalizeWhitespace(ai?.legalLine ?? "");

    const fieldsToCheck = [
      ["headline", outHeadline],
      ["subcopy", outSubcopy],
      ["cta", outCTA],
      ["offerLine", outOffer],
      ["legalLine", outLegal],
    ];

    for (const [name, val] of fieldsToCheck) {
      if (isBadTescoClaim(val)) {
        alerts.push(`${name} contained restricted promo/claim terms; it was softened/removed.`);
        if (name === "offerLine") outOffer = pickBadgeFallback({ objective });
        if (name === "legalLine") outLegal = "";
        if (name === "headline") outHeadline = "New season styles.";
        if (name === "subcopy") outSubcopy = "Explore designs made for everyday wear.";
        if (name === "cta") outCTA = hasCTA ? "View details" : "";
      }
    }

    const allowedLayouts = new Set(["left-packshot", "right-packshot", "center-packshot"]);
    let outLayout = normalizeWhitespace(ai?.layout || layout || "");
    if (!allowedLayouts.has(outLayout)) {
      outLayout = pickLayoutForPreset({ sizePreset });
      alerts.push("Layout normalized to a supported preset.");
    }
    if (pickLayoutForPreset({ sizePreset }) === "center-packshot") outLayout = "center-packshot";

    return res.json({
      headline: outHeadline,
      subcopy: outSubcopy,
      cta: outCTA,
      offerLine: outOffer,
      legalLine: outLegal,
      layout: outLayout,
      alerts,
    });
  } catch (err) {
    console.error("❌ Gemini request failed:", err);
    return res.status(500).json({
      error: "Gemini request failed",
      detail: err?.message || String(err),
    });
  }
});

/** ---------- React serving (single service deploy) ---------- **/
const buildPath = path.join(__dirname, "build");
const hasBuild = fs.existsSync(path.join(buildPath, "index.html"));

if (process.env.NODE_ENV === "production" && hasBuild) {
  app.use(express.static(buildPath));

  app.get("/", (req, res) => {
    res.sendFile(path.join(buildPath, "index.html"));
  });

  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(buildPath, "index.html"));
  });
} else {
  app.get("/", (req, res) => {
    res.send("AdCanvas AI backend is running with Gemini. (React build not served here)");
  });
}

/** Always return JSON on errors */
app.use((err, req, res, next) => {
  console.error("🔥 Unhandled error:", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Internal Server Error", detail: err?.message || String(err) });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`AdCanvas AI backend listening on port ${PORT}`);
});
