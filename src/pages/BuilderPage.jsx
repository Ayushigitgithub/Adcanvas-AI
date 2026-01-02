// src/pages/BuilderPage.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FitStage from "../components/FitStage";
import axios from "axios";
import Konva from "konva";
import { Stage, Layer, Rect, Text, Image as KonvaImage, Transformer } from "react-konva";
import { TEMPLATES } from "../templates";

const SIZE_PRESETS = [
  { id: "ig_square", label: "IG Post • 1080×1080", w: 1080, h: 1080 },
  { id: "ig_story", label: "Story • 1080×1920", w: 1080, h: 1920 },
  { id: "ig_portrait", label: "IG Portrait • 1080×1350", w: 1080, h: 1350 },
  { id: "fb_feed", label: "Feed/Display • 1200×628", w: 1200, h: 628 },
];

const PLATFORM_SIZE_MAP = {
  Instagram: ["ig_square", "ig_story", "ig_portrait"],
  Facebook: ["fb_feed"],
  TikTok: ["ig_story"],
  Display: ["fb_feed"],
};

const ROTATE_IDS = new Set(["packshot"]);
const ALLOWED_LAYOUTS = ["left-packshot", "right-packshot", "center-packshot"];

/** ✅ fixed header spacing */
const FIXED_HEADER_H = 84;

/** ✅ localStorage keys (no new files) */
const LS_KEYS = {
  PALETTE: "adcanvas:palette:v1",
};

function safeLoadJSON(key, fallback) {
  try {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeSaveJSON(key, value) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

function useLoadedImage(url) {
  const [img, setImg] = useState(null);
  useEffect(() => {
    if (!url) {
      setImg(null);
      return;
    }
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => setImg(image);
    image.onerror = () => setImg(null);
    image.src = url;
  }, [url]);
  return img;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function getCoverCrop(img, frameW, frameH) {
  if (!img) return null;
  const imageW = img.width;
  const imageH = img.height;
  const imageRatio = imageW / imageH;
  const frameRatio = frameW / frameH;

  let cropW, cropH, cropX, cropY;
  if (imageRatio > frameRatio) {
    cropH = imageH;
    cropW = imageH * frameRatio;
    cropX = (imageW - cropW) / 2;
    cropY = 0;
  } else {
    cropW = imageW;
    cropH = imageW / frameRatio;
    cropX = 0;
    cropY = (imageH - cropH) / 2;
  }
  return { x: cropX, y: cropY, width: cropW, height: cropH };
}

function scaleNodes(nodes, fromW, fromH, toW, toH) {
  const sx = toW / fromW;
  const sy = toH / fromH;
  const sFont = (sx + sy) / 2;

  return (nodes || []).map((n) => {
    const out = { ...n };
    if (typeof out.x === "number") out.x = out.x * sx;
    if (typeof out.y === "number") out.y = out.y * sy;
    if (typeof out.w === "number") out.w = out.w * sx;
    if (typeof out.h === "number") out.h = out.h * sy;

    if (typeof out.fontSize === "number")
      out.fontSize = clamp(Math.round(out.fontSize * sFont), 14, 220);
    return out;
  });
}

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return await res.blob();
}

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function urlToBlob(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch image");
  return await res.blob();
}

async function downscaleBlob(blob, maxSide = 1400) {
  try {
    const bmp = await createImageBitmap(blob);
    const { width, height } = bmp;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    if (scale >= 1) return blob;

    const outW = Math.round(width * scale);
    const outH = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(bmp, 0, 0, outW, outH);

    const outBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1));
    return outBlob || blob;
  } catch {
    return blob;
  }
}

async function stageToJpegUnder500KB(stage, maxBytes = 500 * 1024) {
  if (typeof stage.toCanvas === "function") {
    const canvas = stage.toCanvas({ pixelRatio: 1 });
    const toBlob = (q) => new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", q));

    let q = 0.92;
    let blob = await toBlob(q);
    if (!blob) throw new Error("JPEG export failed");

    while (blob.size > maxBytes && q > 0.55) {
      q = Math.max(0.55, q - 0.05);
      blob = await toBlob(q);
      if (!blob) throw new Error("JPEG export failed");
    }
    return { blob, quality: q, size: blob.size };
  }

  let quality = 0.92;
  let blob = null;

  for (let i = 0; i < 12; i++) {
    const dataUrl = stage.toDataURL({ pixelRatio: 1, mimeType: "image/jpeg", quality });
    blob = await dataUrlToBlob(dataUrl);
    if (blob.size <= maxBytes) break;
    quality = Math.max(0.55, quality - 0.05);
  }

  if (!blob) throw new Error("JPEG export failed");
  return { blob, quality, size: blob.size };
}

/* ✅ Visual Style presets (extended so styles look visibly different) */
const VISUAL_STYLE_PRESETS = {
  "Bold & modern": {
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
    headlineWeight: "bold",
    subcopyWeight: "normal",
    headlineScale: 1.02,
    subcopyScale: 1.0,
    badgeScale: 1.0,
    badgeFill: "rgba(255,255,255,0.82)",
    badgeRadius: 16,
    headlineLetterSpacing: 0,
    subcopyLetterSpacing: 0,
    brandLetterSpacing: 0.5,
    accentBlock: true,          // ✅ shows style clearly
    accentBlockAlpha: 0.10,
    accentBlockRadius: 22,
  },
  "Minimal & premium": {
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
    headlineWeight: "normal",
    subcopyWeight: "normal",
    headlineScale: 0.92,
    subcopyScale: 0.95,
    badgeScale: 0.92,
    badgeFill: "rgba(255,255,255,0.64)",
    badgeRadius: 14,
    headlineLetterSpacing: 0.2,
    subcopyLetterSpacing: 0.1,
    brandLetterSpacing: 0.8,
    accentBlock: false,
    accentBlockAlpha: 0,
    accentBlockRadius: 16,
  },
  Playful: {
    fontFamily:
      "Trebuchet MS, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
    headlineWeight: "bold",
    subcopyWeight: "normal",
    headlineScale: 1.04,
    subcopyScale: 1.03,
    badgeScale: 1.05,
    badgeFill: "rgba(255,255,255,0.86)",
    badgeRadius: 18,
    headlineLetterSpacing: 0,
    subcopyLetterSpacing: 0,
    brandLetterSpacing: 0.4,
    accentBlock: true,
    accentBlockAlpha: 0.14,
    accentBlockRadius: 30,
  },
  Trustworthy: {
    fontFamily: "Georgia, ui-serif, Times New Roman, Times, serif",
    headlineWeight: "bold",
    subcopyWeight: "normal",
    headlineScale: 0.95,
    subcopyScale: 0.98,
    badgeScale: 0.95,
    badgeFill: "rgba(255,255,255,0.74)",
    badgeRadius: 14,
    headlineLetterSpacing: 0,
    subcopyLetterSpacing: 0,
    brandLetterSpacing: 0.6,
    accentBlock: false,
    accentBlockAlpha: 0,
    accentBlockRadius: 14,
  },
};

function getTypography(layoutId, canvasH, theme) {
  const isStacked = layoutId === "center-packshot";
  const hScale = theme?.headlineScale ?? 1;
  const sScale = theme?.subcopyScale ?? 1;
  const bScale = theme?.badgeScale ?? 1;

  return {
    brand: clamp(Math.round(canvasH * (isStacked ? 0.036 : 0.030)), 18, 56),
    offer: clamp(Math.round(canvasH * (isStacked ? 0.032 : 0.030) * bScale), 16, 56),
    headline: clamp(Math.round(canvasH * (isStacked ? 0.095 : 0.085) * hScale), 44, 200),
    subcopy: clamp(Math.round(canvasH * (isStacked ? 0.040 : 0.034) * sScale), 18, 80),
    legal: clamp(Math.round(canvasH * 0.020), 12, 30),
    cta: clamp(Math.round(canvasH * 0.028), 16, 36),
  };
}

/* ✅ text-fit helper */
function fitFontSizeToBox({
  text,
  width,
  height,
  startSize,
  minSize = 18,
  fontFamily = "Inter",
  fontStyle = "normal",
  lineHeight = 1.08,
  padding = 0,
}) {
  const t = String(text || "").trim();
  if (!t || !width || !height) return startSize;

  let size = startSize;
  const W = Math.max(10, width - padding * 2);
  const H = Math.max(10, height - padding * 2);

  for (let i = 0; i < 28; i++) {
    const temp = new Konva.Text({
      text: t,
      width: W,
      fontSize: size,
      fontFamily,
      fontStyle,
      lineHeight,
      wrap: "word",
      padding: 0,
    });
    const h = temp.height();
    if (h <= H) return size;

    size = Math.max(minSize, Math.floor(size * 0.92));
    if (size === minSize) return size;
  }
  return size;
}

export default function BuilderPage({ campaign, onCampaignChange, onNavigate }) {
  const currentTemplate = TEMPLATES.find((t) => t.id === campaign.templateId) || TEMPLATES[0];
  const hasCTA = Boolean(currentTemplate?.hasCTA);
  const editor = campaign.editor || {};

  // ✅ Merge: template style + visualStyle preset
  const theme = useMemo(() => {
    const base = currentTemplate?.style || currentTemplate?.styles || {};
    const wanted = campaign.visualStyle || "Bold & modern";
    const preset = VISUAL_STYLE_PRESETS[wanted] || VISUAL_STYLE_PRESETS["Bold & modern"];

    return {
      fontFamily: preset.fontFamily || base.fontFamily || currentTemplate?.fontFamily || "Inter",
      headlineWeight: preset.headlineWeight || base.headlineWeight || "bold",
      subcopyWeight: preset.subcopyWeight || base.subcopyWeight || "normal",
      headlineScale: preset.headlineScale ?? base.headlineScale ?? 1,
      subcopyScale: preset.subcopyScale ?? base.subcopyScale ?? 1,
      badgeScale: preset.badgeScale ?? base.badgeScale ?? 1,
      badgeFill: preset.badgeFill || base.badgeFill || "rgba(255,255,255,0.78)",
      badgeRadius: preset.badgeRadius ?? base.badgeRadius ?? 16,
      headlineLetterSpacing: preset.headlineLetterSpacing ?? 0,
      subcopyLetterSpacing: preset.subcopyLetterSpacing ?? 0,
      brandLetterSpacing: preset.brandLetterSpacing ?? 0,

      // ✅ visible style difference
      accentBlock: Boolean(preset.accentBlock),
      accentBlockAlpha: preset.accentBlockAlpha ?? 0,
      accentBlockRadius: preset.accentBlockRadius ?? 18,
    };
  }, [currentTemplate, campaign.visualStyle]);

  const allowedSizeIds = useMemo(() => {
    const p = campaign.platform || "Instagram";
    return PLATFORM_SIZE_MAP[p] || PLATFORM_SIZE_MAP.Instagram;
  }, [campaign.platform]);

  const allowedSizes = useMemo(
    () => SIZE_PRESETS.filter((s) => allowedSizeIds.includes(s.id)),
    [allowedSizeIds]
  );

  const initialSize =
    (allowedSizeIds.includes(editor.sizePreset) && editor.sizePreset) ||
    allowedSizeIds[0] ||
    "ig_story";

  const [sizePreset, setSizePreset] = useState(initialSize);

  // ✅ keep Builder size in sync with Setup changes
  useEffect(() => {
    const next =
      (allowedSizeIds.includes(editor.sizePreset) && editor.sizePreset) ||
      allowedSizeIds[0] ||
      "ig_story";
    setSizePreset(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.sizePreset, allowedSizeIds.join("|")]);

  const preset = useMemo(
    () => SIZE_PRESETS.find((s) => s.id === sizePreset) || SIZE_PRESETS[0],
    [sizePreset]
  );
  const canvasW = preset.w;
  const canvasH = preset.h;

  // Safe area
  const SAFE = useMemo(() => Math.round(Math.min(canvasW, canvasH) * 0.06), [canvasW, canvasH]);
  const safeX = SAFE;
  const safeY = SAFE;
  const safeW = canvasW - SAFE * 2;
  const safeH = canvasH - SAFE * 2;

  const isSafeId = useCallback(
    (id) => {
      if (id === "cta" && !hasCTA) return false;
      return ["logo", "brand", "headline", "subcopy", "offer", "cta", "legal"].includes(id);
    },
    [hasCTA]
  );

  const clampToSafe = useCallback(
    (id, x, y, w = 0, h = 0) => {
      if (!isSafeId(id)) return { x: clamp(x, 0, canvasW - 10), y: clamp(y, 0, canvasH - 10) };
      const maxX = safeX + safeW - w;
      const maxY = safeY + safeH - h;
      return { x: clamp(x, safeX, maxX), y: clamp(y, safeY, maxY) };
    },
    [canvasW, canvasH, isSafeId, safeX, safeY, safeW, safeH]
  );

  // Copy states
  const [cta, setCta] = useState(editor.cta || "View details");
  const [headline, setHeadline] = useState(editor.headline || "the glasses. elevated style.");
  const [subcopy, setSubcopy] = useState(
    editor.subcopy || "Discover timeless designs and exceptional quality."
  );
  const [offerLine, setOfferLine] = useState(editor.offerLine || "");
  const [legalLine, setLegalLine] = useState(editor.legalLine || "");
  const [layout, setLayout] = useState(editor.layout || "left-packshot");

  // AI states
  const [isLoading, setIsLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [copyAlerts, setCopyAlerts] = useState([]);
  const [aiNotesOpen, setAiNotesOpen] = useState(false);

  const brand = campaign.brandName || "Your brand";
  const accent = campaign.primaryColor || "#2563eb";

  /** ✅ Palette: editor.palette → localStorage fallback → default */
  const [palette, setPalette] = useState(() => {
    const fromEditor = Array.isArray(editor.palette) ? editor.palette : null;
    const fromLS = safeLoadJSON(LS_KEYS.PALETTE, null);
    const base = fromEditor || fromLS || [accent, "#111827", "#ffffff"];
    const uniq = Array.from(new Set(base.filter(Boolean)));
    return uniq.slice(0, 8);
  });

  // keep palette saved
  useEffect(() => {
    safeSaveJSON(LS_KEYS.PALETTE, palette);
  }, [palette]);

  // BG removal state
  const [removeBgBusy, setRemoveBgBusy] = useState(false);
  const [removeBgMsg, setRemoveBgMsg] = useState("");
  const [packshotNoBgUrl, setPackshotNoBgUrl] = useState(editor.packshotNoBgUrl || "");
  const prevNoBgUrlRef = useRef("");

  useEffect(() => {
    const prev = prevNoBgUrlRef.current;
    if (prev && prev !== packshotNoBgUrl && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
    prevNoBgUrlRef.current = packshotNoBgUrl;
  }, [packshotNoBgUrl]);

  // Images
  const bgImg = useLoadedImage(campaign.backgroundUrl);
  const packImg = useLoadedImage(packshotNoBgUrl || campaign.packshotUrl);
  const logoImg = useLoadedImage(campaign.logoUrl);

  const stageRef = useRef(null);

  const typo = useMemo(() => getTypography(layout, canvasH, theme), [layout, canvasH, theme]);

  // ✅ Track if user manually edited nodes
  const dirtyRef = useRef(false);
  const markDirty = () => {
    dirtyRef.current = true;
  };
  const markClean = () => {
    dirtyRef.current = false;
  };

  // ✅ Better layout math: always inside SAFE box
  const layoutMetrics = useMemo(() => {
    const gap = Math.round(safeW * 0.05);
    const packW = Math.round(safeW * 0.40);
    const textXLeft = safeX + packW + gap;
    const textW = safeX + safeW - textXLeft;
    const packXLeft = safeX;
    const packXRight = safeX + safeW - packW;
    return { gap, packW, textXLeft, textW, packXLeft, packXRight };
  }, [safeW, safeX, safeH, safeY, safeX, safeW]);

  const [nodes, setNodes] = useState(() => {
    if (Array.isArray(editor.nodes) && editor.nodes.length > 0) return editor.nodes;

    const { packW, textXLeft, textW, packXLeft } = layoutMetrics;

    const base = [
      {
        id: "packshot",
        type: "image",
        x: packXLeft,
        y: safeY + Math.round(safeH * 0.18),
        w: packW,
        h: Math.round(safeH * 0.54),
        rotation: 0,
      },
      {
        id: "logo",
        type: "image",
        x: textXLeft,
        y: safeY,
        w: Math.round(textW * 0.35),
        h: Math.round(safeH * 0.10),
        rotation: 0,
      },
      {
        id: "brand",
        type: "tag",
        x: safeX + Math.round(safeW * 0.72),
        y: safeY,
        w: Math.round(safeW * 0.26),
        h: Math.round(Math.max(56, canvasH * 0.06)),
        rotation: 0,
        fontSize: typo.brand,
        autoFont: true,
      },
      {
        id: "offer",
        type: "text",
        x: textXLeft,
        y: safeY + Math.round(safeH * 0.12),
        w: textW,
        h: Math.round(safeH * 0.10),
        rotation: 0,
        fontSize: typo.offer,
        autoFont: true,
      },
      {
        id: "headline",
        type: "text",
        x: textXLeft,
        y: safeY + Math.round(safeH * 0.22),
        w: textW,
        h: Math.round(safeH * 0.30),
        rotation: 0,
        fontSize: typo.headline,
        autoFont: true,
      },
      {
        id: "subcopy",
        type: "text",
        x: textXLeft,
        y: safeY + Math.round(safeH * 0.55),
        w: textW,
        h: Math.round(safeH * 0.18),
        rotation: 0,
        fontSize: typo.subcopy,
        autoFont: true,
      },
      {
        id: "legal",
        type: "text",
        x: safeX,
        y: safeY + safeH - Math.round(safeH * 0.07),
        w: safeW,
        h: Math.round(safeH * 0.07),
        rotation: 0,
        fontSize: typo.legal,
        autoFont: true,
      },
    ];

    if (hasCTA) {
      base.splice(6, 0, {
        id: "cta",
        type: "cta",
        x: textXLeft,
        y: safeY + Math.round(safeH * 0.78),
        w: Math.round(textW * 0.66),
        h: Math.round(Math.max(56, canvasH * 0.06)),
        rotation: 0,
      });
    }

    return base;
  });

  // ✅ Scale nodes when size changes.
  const prevSizeRef = useRef({ w: canvasW, h: canvasH });
  useEffect(() => {
    const prev = prevSizeRef.current;
    if (prev.w === canvasW && prev.h === canvasH) return;

    setNodes((old) => {
      const scaled = scaleNodes(old, prev.w, prev.h, canvasW, canvasH);

      const clamped = scaled.map((n) => {
        let w = n.w ?? 0;
        let h = n.h ?? 0;

        if (isSafeId(n.id)) {
          w = clamp(w, 30, safeW);
          h = clamp(h, 20, safeH);
        }
        const pos = clampToSafe(n.id, n.x ?? 0, n.y ?? 0, w, h);
        return { ...n, w, h, x: pos.x, y: pos.y };
      });

      return clamped;
    });

    prevSizeRef.current = { w: canvasW, h: canvasH };
  }, [canvasW, canvasH, clampToSafe, isSafeId, safeW, safeH]);

  // Auto font refresh when layout/style changes
  useEffect(() => {
    const t = getTypography(layout, canvasH, theme);
    setNodes((prev) =>
      prev.map((n) => {
        if (!n.autoFont) return n;
        if (n.id === "brand") return { ...n, fontSize: t.brand };
        if (n.id === "offer") return { ...n, fontSize: t.offer };
        if (n.id === "headline") return { ...n, fontSize: t.headline };
        if (n.id === "subcopy") return { ...n, fontSize: t.subcopy };
        if (n.id === "legal") return { ...n, fontSize: t.legal };
        return n;
      })
    );
  }, [layout, canvasH, theme, campaign.templateId, campaign.visualStyle]);

  // ✅ Save back into campaign.editor (now includes palette)
  useEffect(() => {
    if (!onCampaignChange) return;
    onCampaignChange((prev) => ({
      ...prev,
      editor: {
        ...(prev.editor || {}),
        sizePreset: preset.id,
        canvasWidth: canvasW,
        canvasHeight: canvasH,
        nodes,
        headline,
        subcopy,
        cta: hasCTA ? cta : "",
        offerLine,
        legalLine,
        layout,
        packshotNoBgUrl,
        palette, // ✅ NEW
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    nodes,
    headline,
    subcopy,
    cta,
    offerLine,
    legalLine,
    layout,
    packshotNoBgUrl,
    preset.id,
    canvasW,
    canvasH,
    hasCTA,
    palette,
  ]);

  // Layout presets
  const applyLayout = useCallback(
    (layoutId, { force = true } = {}) => {
      const nextLayout = ALLOWED_LAYOUTS.includes(layoutId) ? layoutId : "left-packshot";
      setLayout(nextLayout);

      if (!force && dirtyRef.current) return;
      markClean();

      setNodes((prev) => {
        const byId = Object.fromEntries(prev.map((n) => [n.id, n]));
        const pack = byId.packshot || { id: "packshot", type: "image" };
        const logo = byId.logo || { id: "logo", type: "image" };
        const br = byId.brand || { id: "brand", type: "tag" };
        const offer = byId.offer || { id: "offer", type: "text" };
        const h = byId.headline || { id: "headline", type: "text" };
        const s = byId.subcopy || { id: "subcopy", type: "text" };
        const legal = byId.legal || { id: "legal", type: "text" };
        const ctaNode = hasCTA ? byId.cta || { id: "cta", type: "cta" } : null;

        const gap = Math.round(safeW * 0.05);
        const packW = Math.round(safeW * 0.40);
        const textW = Math.round(safeW - packW - gap);
        const textXLeft = safeX + packW + gap;
        const textXRight = safeX;
        const packXLeft = safeX;
        const packXRight = safeX + safeW - packW;

        let next = [];

        if (nextLayout === "left-packshot") {
          next = [
            { ...pack, x: packXLeft, y: safeY + Math.round(safeH * 0.18), w: packW, h: Math.round(safeH * 0.54), rotation: pack.rotation || 0 },
            { ...logo, x: textXLeft, y: safeY, w: Math.round(textW * 0.35), h: Math.round(safeH * 0.10), rotation: 0 },
            { ...br, x: safeX + Math.round(safeW * 0.72), y: safeY, w: Math.round(safeW * 0.26), h: Math.round(Math.max(56, canvasH * 0.06)), rotation: 0 },
            { ...offer, x: textXLeft, y: safeY + Math.round(safeH * 0.12), w: textW, h: Math.round(safeH * 0.10), rotation: 0 },
            { ...h, x: textXLeft, y: safeY + Math.round(safeH * 0.22), w: textW, h: Math.round(safeH * 0.30), rotation: 0 },
            { ...s, x: textXLeft, y: safeY + Math.round(safeH * 0.55), w: textW, h: Math.round(safeH * 0.18), rotation: 0 },
          ];
          if (hasCTA && ctaNode) next.push({ ...ctaNode, x: textXLeft, y: safeY + Math.round(safeH * 0.78), w: Math.round(textW * 0.66), h: Math.round(Math.max(56, canvasH * 0.06)), rotation: 0 });
          next.push({ ...legal, x: safeX, y: safeY + safeH - Math.round(safeH * 0.07), w: safeW, h: Math.round(safeH * 0.07), rotation: 0 });
        } else if (nextLayout === "right-packshot") {
          next = [
            { ...pack, x: packXRight, y: safeY + Math.round(safeH * 0.18), w: packW, h: Math.round(safeH * 0.54), rotation: pack.rotation || 0 },
            { ...logo, x: textXRight, y: safeY, w: Math.round(textW * 0.35), h: Math.round(safeH * 0.10), rotation: 0 },
            { ...br, x: safeX + Math.round(safeW * 0.10), y: safeY, w: Math.round(safeW * 0.30), h: Math.round(Math.max(56, canvasH * 0.06)), rotation: 0 },
            { ...offer, x: textXRight, y: safeY + Math.round(safeH * 0.12), w: textW, h: Math.round(safeH * 0.10), rotation: 0 },
            { ...h, x: textXRight, y: safeY + Math.round(safeH * 0.22), w: textW, h: Math.round(safeH * 0.30), rotation: 0 },
            { ...s, x: textXRight, y: safeY + Math.round(safeH * 0.55), w: textW, h: Math.round(safeH * 0.18), rotation: 0 },
          ];
          if (hasCTA && ctaNode) next.push({ ...ctaNode, x: textXRight, y: safeY + Math.round(safeH * 0.78), w: Math.round(textW * 0.66), h: Math.round(Math.max(56, canvasH * 0.06)), rotation: 0 });
          next.push({ ...legal, x: safeX, y: safeY + safeH - Math.round(safeH * 0.07), w: safeW, h: Math.round(safeH * 0.07), rotation: 0 });
        } else {
          // center-packshot (stacked)
          const stackW = Math.round(safeW * 0.90);
          const stackX = safeX + Math.round((safeW - stackW) / 2);

          next = [
            { ...pack, x: safeX + Math.round(safeW * 0.32), y: safeY + Math.round(safeH * 0.12), w: Math.round(safeW * 0.36), h: Math.round(safeH * 0.30), rotation: pack.rotation || 0 },
            { ...logo, x: stackX, y: safeY, w: Math.round(stackW * 0.28), h: Math.round(safeH * 0.10), rotation: 0 },
            { ...br, x: stackX, y: safeY, w: stackW, h: Math.round(Math.max(56, canvasH * 0.06)), rotation: 0 },
            { ...offer, x: stackX, y: safeY + Math.round(safeH * 0.46), w: stackW, h: Math.round(safeH * 0.08), rotation: 0 },
            { ...h, x: stackX, y: safeY + Math.round(safeH * 0.54), w: stackW, h: Math.round(safeH * 0.18), rotation: 0 },
            { ...s, x: stackX, y: safeY + Math.round(safeH * 0.72), w: stackW, h: Math.round(safeH * 0.10), rotation: 0 },
          ];
          if (hasCTA && ctaNode) next.push({ ...ctaNode, x: stackX, y: safeY + Math.round(safeH * 0.84), w: Math.round(stackW * 0.40), h: Math.round(Math.max(56, canvasH * 0.06)), rotation: 0 });
          next.push({ ...legal, x: safeX, y: safeY + safeH - Math.round(safeH * 0.07), w: safeW, h: Math.round(safeH * 0.07), rotation: 0 });
        }

        return next.map((n) => {
          let w = n.w ?? 0;
          let h2 = n.h ?? 0;
          if (isSafeId(n.id)) {
            w = clamp(w, 30, safeW);
            h2 = clamp(h2, 20, safeH);
          }
          const pos = clampToSafe(n.id, n.x ?? 0, n.y ?? 0, w, h2);
          return { ...n, w, h: h2, x: pos.x, y: pos.y };
        });
      });
    },
    [canvasH, clampToSafe, hasCTA, isSafeId, safeH, safeW, safeX, safeY, canvasW]
  );

  // ✅ when sizePreset changes, reflow layout only if user hasn't moved stuff
  useEffect(() => {
    applyLayout(layout, { force: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasW, canvasH]);

  const [selectedId, setSelectedId] = useState(null);
  const trRef = useRef(null);
  const shapeRefs = useRef({});

  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node = selectedId ? shapeRefs.current[selectedId] : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId]);

  const updateNode = (id, patch) => {
    markDirty();
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  const handleDragEnd = (id, e) => {
    markDirty();
    const k = e.target;
    const isTextId = ["headline", "subcopy", "offer", "legal"].includes(id);
    const w = isTextId ? k.width() : (nodes.find((n) => n.id === id)?.w ?? k.width?.() ?? 0);
    const h = isTextId ? k.height() : (nodes.find((n) => n.id === id)?.h ?? k.height?.() ?? 0);
    const pos = clampToSafe(id, k.x(), k.y(), w, h);
    updateNode(id, { x: pos.x, y: pos.y, w, h });
  };

  const handleTransformEnd = (id) => {
    markDirty();
    const node = shapeRefs.current[id];
    if (!node) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    node.scaleX(1);
    node.scaleY(1);

    const isText = ["headline", "subcopy", "offer", "legal", "brand"].includes(id);
    const current = nodes.find((n) => n.id === id);

    let nextW = clamp(node.width() * scaleX, 30, canvasW);
    let nextH = clamp(node.height() * scaleY, 20, canvasH);

    if (isSafeId(id)) {
      nextW = clamp(nextW, 30, safeW);
      nextH = clamp(nextH, 20, safeH);
    }

    const nextRotation = ROTATE_IDS.has(id) ? node.rotation() : 0;
    const pos = clampToSafe(id, node.x(), node.y(), nextW, nextH);

    const patch = { x: pos.x, y: pos.y, w: nextW, h: nextH, rotation: nextRotation };

    if (isText && current?.fontSize) {
      const scaled = Math.round(current.fontSize * ((scaleX + scaleY) / 2));
      patch.fontSize = clamp(scaled, 14, 220);
      patch.autoFont = false;
    }
    updateNode(id, patch);
  };

  useEffect(() => {
    stageRef.current?.batchDraw();
  }, [layout, nodes, bgImg, packImg, logoImg, theme, accent]);

  const handleRemoveBackground = useCallback(async () => {
    try {
      if (!campaign.packshotUrl) return;

      setRemoveBgBusy(true);
      setRemoveBgMsg("Preparing…");
      setAiError("");

      const blob = await urlToBlob(campaign.packshotUrl);
      const smallBlob = await downscaleBlob(blob, 1400);

      setRemoveBgMsg("Removing BG…");
      const mod = await import("@imgly/background-removal");
      const outBlob = await mod.removeBackground(smallBlob);

      const outUrl = URL.createObjectURL(outBlob);
      setPackshotNoBgUrl(outUrl);

      setRemoveBgMsg("Done ✅");
      setTimeout(() => setRemoveBgMsg(""), 900);
    } catch (e) {
      console.error(e);
      setRemoveBgMsg("");
      setAiError(`Background removal failed. ${e?.message ? `(${e.message})` : ""}`);
    } finally {
      setRemoveBgBusy(false);
    }
  }, [campaign.packshotUrl]);

  const handleGenerateClick = async () => {
    try {
      setIsLoading(true);
      setAiError("");
      setCopyAlerts([]);
      setAiNotesOpen(false);

      const payload = {
        campaign: {
          platform: campaign.platform,
          objective: campaign.objective,
          brandName: campaign.brandName,
          tone: campaign.tone,
          visualStyle: campaign.visualStyle,
          templateId: campaign.templateId,
          templateName: currentTemplate.name,
          hasCTA,
          primaryColor: campaign.primaryColor,
        },
        creative: {
          layout,
          sizePreset: preset.id,
          headline,
          subcopy,
          cta: hasCTA ? cta : "",
          offerLine,
          legalLine,
        },
      };

     const res = await axios.post("/api/generate-copy", payload);


      const data = res.data || {};
      const h = data.headline ?? data.title ?? data.primaryText;
      const s = data.subcopy ?? data.supportingLine ?? data.body ?? data.description;
      const newCta = data.cta ?? data.buttonText;
      const newOffer = data.offerLine ?? data.offer ?? data.promoLine;
      const newLegal = data.legalLine ?? data.legal ?? data.tnc;
      const alerts = data.alerts ?? data.notes ?? [];
      const aiLayout = data.layout ?? data.layoutId;

      if (typeof h === "string" && h.trim()) setHeadline(h);
      if (typeof s === "string" && s.trim()) setSubcopy(s);
      if (typeof newOffer === "string") setOfferLine(newOffer);
      if (typeof newLegal === "string") setLegalLine(newLegal);
      if (hasCTA && typeof newCta === "string" && newCta.trim()) setCta(newCta);
      if (aiLayout && ALLOWED_LAYOUTS.includes(aiLayout)) applyLayout(aiLayout, { force: true });
      if (Array.isArray(alerts) && alerts.length) setCopyAlerts(alerts);

      setTimeout(() => stageRef.current?.batchDraw(), 0);
    } catch (err) {
      console.error(err);
      setAiError("AI service not reachable.");
    } finally {
      setIsLoading(false);
    }
  };

  const downloadPNG = async () => {
    const stage = stageRef.current;
    if (!stage) return;
    setSelectedId(null);
    stage.draw();
    const dataUrl = stage.toDataURL({ pixelRatio: 1, mimeType: "image/png" });
    const blob = await dataUrlToBlob(dataUrl);
    downloadBlob(blob, "adcanvas.png");
  };

  const downloadJPEGUnder500KB = async () => {
    const stage = stageRef.current;
    if (!stage) return;
    setSelectedId(null);
    stage.draw();
    try {
      const { blob } = await stageToJpegUnder500KB(stage, 500 * 1024);
      downloadBlob(blob, "adcanvas.jpg");
    } catch (e) {
      console.error(e);
      setAiError("JPEG export failed.");
    }
  };

  const packNode = nodes.find((n) => n.id === "packshot");
  const logoNode = nodes.find((n) => n.id === "logo");
  const brandNode = nodes.find((n) => n.id === "brand");
  const offerNode = nodes.find((n) => n.id === "offer");
  const headlineNode = nodes.find((n) => n.id === "headline");
  const subcopyNode = nodes.find((n) => n.id === "subcopy");
  const ctaNode = nodes.find((n) => n.id === "cta");
  const legalNode = nodes.find((n) => n.id === "legal");

  const aiNotesCount = copyAlerts.length;
  const labelStyle = { textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 12 };
  const TXT_PAD = 6;

  /** ✅ Palette actions */
  const setPrimaryColor = (hex) => {
    if (!onCampaignChange) return;
    onCampaignChange((prev) => ({ ...prev, primaryColor: hex }));
  };

  const addToPalette = (hex) => {
    const clean = String(hex || "").trim();
    if (!clean) return;
    setPalette((p) => {
      const next = Array.from(new Set([clean, ...(p || [])])).slice(0, 8);
      return next;
    });
  };

  const removeFromPalette = (hex) => {
    setPalette((p) => (p || []).filter((c) => c !== hex));
  };

  /** ✅ Suggestions (deterministic, no extra services) */
  const applySuggestion = (type) => {
    if (type === "premium") {
      // More premium: minimal style + stacked layout
      if (onCampaignChange) {
        onCampaignChange((prev) => ({ ...prev, visualStyle: "Minimal & premium" }));
      }
      applyLayout("center-packshot", { force: true });
      return;
    }
    if (type === "product") {
      // Product-forward: packshot bigger and left/right layout depending on current
      const target = layout === "right-packshot" ? "right-packshot" : "left-packshot";
      applyLayout(target, { force: true });
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== "packshot") return n;
          const grow = 1.08;
          const nextW = clamp(Math.round((n.w || 0) * grow), 30, safeW);
          const nextH = clamp(Math.round((n.h || 0) * grow), 20, safeH);
          const pos = clampToSafe("packshot", n.x || 0, n.y || 0, nextW, nextH);
          return { ...n, w: nextW, h: nextH, x: pos.x, y: pos.y };
        })
      );
      return;
    }
    // Layout alternative: cycle layouts
    const order = ["left-packshot", "right-packshot", "center-packshot"];
    const idx = Math.max(0, order.indexOf(layout));
    const next = order[(idx + 1) % order.length];
    applyLayout(next, { force: true });
  };

  return (
    <section className="page-card" style={{ marginTop: FIXED_HEADER_H }}>
      <div className="badge-soft">Step 2 • Builder</div>
      <h2 style={{ textTransform: "uppercase", letterSpacing: "0.02em" }}>Creative Builder</h2>

      <div className="page-grid">
        {/* LEFT */}
        <div className="form-column">
          <div className="field">
            <label style={labelStyle}>Creative size</label>
            <select
              className="select-input"
              value={sizePreset}
              onChange={(e) => {
                setSizePreset(e.target.value);
              }}
            >
              {allowedSizes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label style={labelStyle}>Layout</label>
            <select
              className="select-input"
              value={layout}
              onChange={(e) => applyLayout(e.target.value, { force: true })}
            >
              <option value="left-packshot">Packshot left</option>
              <option value="right-packshot">Packshot right</option>
              <option value="center-packshot">Stacked</option>
            </select>
          </div>

          {/* ✅ NEW: Palette */}
          <div className="field">
            <label style={labelStyle}>Saved palette</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {(palette || []).map((c) => (
                <button
                  key={c}
                  type="button"
                  title={`Use ${c}`}
                  onClick={() => setPrimaryColor(c)}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.14)",
                    background: c,
                    cursor: "pointer",
                  }}
                />
              ))}
              {(palette || []).map((c) => (
                <button
                  key={c + "_x"}
                  type="button"
                  title="Remove"
                  onClick={() => removeFromPalette(c)}
                  style={{
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    opacity: 0.6,
                    fontSize: 14,
                    marginLeft: -6,
                  }}
                >
                  ×
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                className="text-input"
                placeholder="#2563eb"
                onKeyDown={(e) => {
                  if (e.key === "Enter") addToPalette(e.currentTarget.value);
                }}
              />
              <button type="button" className="secondary-btn" onClick={() => addToPalette(accent)}>
                Save current
              </button>
            </div>
            <div className="helper-text" style={{ marginTop: 6 }}>
              Click a swatch to apply it as primary color.
            </div>
          </div>

          {/* ✅ NEW: Suggestions */}
          <div className="field">
            <label style={labelStyle}>Suggestions</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" className="secondary-btn" onClick={() => applySuggestion("premium")}>
                Premium emphasis
              </button>
              <button type="button" className="secondary-btn" onClick={() => applySuggestion("product")}>
                Product-forward
              </button>
              <button type="button" className="secondary-btn" onClick={() => applySuggestion("layout")}>
                Try another layout
              </button>
            </div>
          </div>

          <div className="field">
            <label style={labelStyle}>Headline</label>
            <input
              className="text-input"
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
            />
          </div>

          <div className="field">
            <label style={labelStyle}>Supporting line</label>
            <textarea
              className="textarea-input"
              rows={3}
              value={subcopy}
              onChange={(e) => setSubcopy(e.target.value)}
            />
          </div>

          <div className="field">
            <label style={labelStyle}>Badge / Highlight (optional)</label>
            <input className="text-input" value={offerLine} onChange={(e) => setOfferLine(e.target.value)} />
          </div>

          <div className="field">
            <label style={labelStyle}>T&Cs / Legal (optional)</label>
            <input className="text-input" value={legalLine} onChange={(e) => setLegalLine(e.target.value)} />
          </div>

          <div className="page-footer" style={{ gap: 10 }}>
            <button type="button" className="secondary-btn" onClick={handleGenerateClick} disabled={isLoading}>
              {isLoading ? "Generating…" : "Generate with AI"}
            </button>

            <button
              type="button"
              className="secondary-btn"
              onClick={handleRemoveBackground}
              disabled={removeBgBusy || !campaign.packshotUrl}
              title={!campaign.packshotUrl ? "Upload a packshot in Setup" : ""}
            >
              {removeBgBusy ? "Removing BG…" : "Remove BG"}
            </button>
          </div>

          {removeBgMsg && (
            <div className="helper-text" style={{ marginTop: 8 }}>
              {removeBgMsg}
            </div>
          )}

          {aiError && (
            <div className="ai-status warning" style={{ marginTop: 10 }}>
              {aiError}
            </div>
          )}

          {aiNotesCount > 0 && (
            <div style={{ marginTop: 10 }}>
              <button type="button" className="secondary-btn" onClick={() => setAiNotesOpen((v) => !v)}>
                AI notes ({aiNotesCount})
              </button>

              {aiNotesOpen && (
                <div className="ai-status warning" style={{ marginTop: 10 }}>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {copyAlerts.map((msg, idx) => (
                      <li key={idx}>{msg}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {hasCTA && (
            <div className="field">
              <label style={labelStyle}>CTA</label>
              <select className="select-input" value={cta} onChange={(e) => setCta(e.target.value)}>
                <option value="View details">View details</option>
                <option value="Browse range">Browse range</option>
                <option value="See more">See more</option>
                <option value="Learn more">Learn more</option>
              </select>
            </div>
          )}

          <div className="page-footer" style={{ gap: 10 }}>
            <button type="button" className="secondary-btn" onClick={downloadPNG}>
              PNG
            </button>
            <button type="button" className="secondary-btn" onClick={downloadJPEGUnder500KB}>
              JPEG
            </button>
          </div>

          <div className="page-footer">
            <button type="button" className="secondary-btn" onClick={() => onNavigate && onNavigate("setup")}>
              ← Setup
            </button>
            <button type="button" className="primary-btn" onClick={() => onNavigate && onNavigate("review")}>
              Review →
            </button>
          </div>
        </div>

        {/* RIGHT */}
        <aside className="preview-column">
          <FitStage canvasW={canvasW} canvasH={canvasH} headerOffset={260}>
            <Stage
              ref={stageRef}
              width={canvasW}
              height={canvasH}
              onMouseDown={(e) => {
                const clickedOnEmpty = e.target === e.target.getStage();
                if (clickedOnEmpty) setSelectedId(null);
              }}
              style={{ background: "#ffffff", display: "block" }}
            >
              <Layer>
                <Rect x={0} y={0} width={canvasW} height={canvasH} fill="#ffffff" />

                {bgImg && (
                  <KonvaImage
                    image={bgImg}
                    x={0}
                    y={0}
                    width={canvasW}
                    height={canvasH}
                    crop={getCoverCrop(bgImg, canvasW, canvasH)}
                    listening={false}
                  />
                )}

                {/* packshot (already has resize/rotate via Transformer) */}
                {packNode &&
                  (packImg ? (
                    <KonvaImage
                      ref={(r) => (shapeRefs.current["packshot"] = r)}
                      image={packImg}
                      x={packNode.x}
                      y={packNode.y}
                      width={packNode.w}
                      height={packNode.h}
                      rotation={packNode.rotation || 0}
                      draggable
                      onClick={() => setSelectedId("packshot")}
                      onTap={() => setSelectedId("packshot")}
                      onDragEnd={(e) => handleDragEnd("packshot", e)}
                      onTransformEnd={() => handleTransformEnd("packshot")}
                    />
                  ) : (
                    <Rect
                      ref={(r) => (shapeRefs.current["packshot"] = r)}
                      x={packNode.x}
                      y={packNode.y}
                      width={packNode.w}
                      height={packNode.h}
                      fill="rgba(0,0,0,0.06)"
                      stroke="rgba(0,0,0,0.18)"
                      draggable
                      onClick={() => setSelectedId("packshot")}
                      onDragEnd={(e) => handleDragEnd("packshot", e)}
                      onTransformEnd={() => handleTransformEnd("packshot")}
                    />
                  ))}

                {/* logo */}
                {logoNode && logoImg && (
                  <KonvaImage
                    ref={(r) => (shapeRefs.current["logo"] = r)}
                    image={logoImg}
                    x={logoNode.x}
                    y={logoNode.y}
                    width={logoNode.w}
                    height={logoNode.h}
                    draggable
                    onClick={() => setSelectedId("logo")}
                    onTap={() => setSelectedId("logo")}
                    onDragEnd={(e) => handleDragEnd("logo", e)}
                    onTransformEnd={() => handleTransformEnd("logo")}
                  />
                )}

                {/* brand */}
                {brandNode && (
                  <>
                    <Rect
                      ref={(r) => (shapeRefs.current["brand"] = r)}
                      x={brandNode.x}
                      y={brandNode.y}
                      width={brandNode.w}
                      height={brandNode.h}
                      fill={theme.badgeFill}
                      stroke="rgba(0,0,0,0.10)"
                      cornerRadius={theme.badgeRadius}
                      draggable
                      rotation={0}
                      onClick={() => setSelectedId("brand")}
                      onTap={() => setSelectedId("brand")}
                      onDragEnd={(e) => handleDragEnd("brand", e)}
                      onTransformEnd={() => handleTransformEnd("brand")}
                    />
                    <Text
                      x={brandNode.x + 14}
                      y={brandNode.y + Math.max(8, (brandNode.h - (brandNode.fontSize || typo.brand)) / 2)}
                      width={brandNode.w - 28}
                      text={brand}
                      fontFamily={theme.fontFamily}
                      fontSize={brandNode.fontSize || typo.brand}
                      fill={accent}
                      fontStyle="bold"
                      letterSpacing={theme.brandLetterSpacing || 0}
                      listening={false}
                      ellipsis
                    />
                  </>
                )}

                {/* offer badge */}
                {offerNode && offerLine?.trim() && (
                  <>
                    <Rect
                      x={offerNode.x}
                      y={offerNode.y}
                      width={offerNode.w}
                      height={offerNode.h}
                      fill={theme.badgeFill}
                      cornerRadius={theme.badgeRadius}
                      listening={false}
                    />
                    <Text
                      ref={(r) => (shapeRefs.current["offer"] = r)}
                      x={offerNode.x}
                      y={offerNode.y}
                      width={offerNode.w}
                      padding={TXT_PAD}
                      text={offerLine}
                      fontFamily={theme.fontFamily}
                      fontSize={fitFontSizeToBox({
                        text: offerLine,
                        width: offerNode.w,
                        height: offerNode.h,
                        startSize: offerNode.fontSize || typo.offer,
                        minSize: 14,
                        fontStyle: "bold",
                        lineHeight: 1.1,
                        fontFamily: theme.fontFamily,
                        padding: TXT_PAD,
                      })}
                      lineHeight={1.1}
                      fill="#111"
                      fontStyle="bold"
                      wrap="word"
                      draggable
                      rotation={0}
                      onClick={() => setSelectedId("offer")}
                      onTap={() => setSelectedId("offer")}
                      onDragEnd={(e) => handleDragEnd("offer", e)}
                      onTransformEnd={() => handleTransformEnd("offer")}
                    />
                  </>
                )}

                {/* ✅ NEW: accent highlight block behind headline for styles that enable it */}
                {headlineNode && theme.accentBlock && (
                  <Rect
                    x={headlineNode.x + 2}
                    y={headlineNode.y + 6}
                    width={Math.max(10, headlineNode.w - 4)}
                    height={Math.max(10, headlineNode.h - 12)}
                    fill={`rgba(37,99,235,${theme.accentBlockAlpha || 0.10})`}
                    // ^ default is blue-ish; we override next line with accent using Konva Color trick below
                    cornerRadius={theme.accentBlockRadius || 18}
                    listening={false}
                  />
                )}

                {/* headline */}
                {headlineNode && (
                  <>
                    {/* accent override using your selected color */}
                    {headlineNode && theme.accentBlock && (
                      <Rect
                        x={headlineNode.x + 2}
                        y={headlineNode.y + 6}
                        width={Math.max(10, headlineNode.w - 4)}
                        height={Math.max(10, headlineNode.h - 12)}
                        fill={accent}
                        opacity={theme.accentBlockAlpha || 0.10}
                        cornerRadius={theme.accentBlockRadius || 18}
                        listening={false}
                      />
                    )}

                    <Text
                      ref={(r) => (shapeRefs.current["headline"] = r)}
                      x={headlineNode.x}
                      y={headlineNode.y}
                      width={headlineNode.w}
                      padding={TXT_PAD}
                      text={headline}
                      fontFamily={theme.fontFamily}
                      fontSize={fitFontSizeToBox({
                        text: headline,
                        width: headlineNode.w,
                        height: headlineNode.h,
                        startSize: headlineNode.fontSize || typo.headline,
                        minSize: 34,
                        fontStyle: theme.headlineWeight === "bold" ? "bold" : "normal",
                        lineHeight: 1.03,
                        fontFamily: theme.fontFamily,
                        padding: TXT_PAD,
                      })}
                      lineHeight={1.03}
                      wrap="word"
                      fill="#111"
                      fontStyle={theme.headlineWeight === "bold" ? "bold" : "normal"}
                      letterSpacing={theme.headlineLetterSpacing || 0}
                      draggable
                      rotation={0}
                      onClick={() => setSelectedId("headline")}
                      onTap={() => setSelectedId("headline")}
                      onDragEnd={(e) => handleDragEnd("headline", e)}
                      onTransformEnd={() => handleTransformEnd("headline")}
                    />
                  </>
                )}

                {/* subcopy */}
                {subcopyNode && (
                  <Text
                    ref={(r) => (shapeRefs.current["subcopy"] = r)}
                    x={subcopyNode.x}
                    y={subcopyNode.y}
                    width={subcopyNode.w}
                    padding={TXT_PAD}
                    text={subcopy}
                    fontFamily={theme.fontFamily}
                    fontSize={fitFontSizeToBox({
                      text: subcopy,
                      width: subcopyNode.w,
                      height: subcopyNode.h,
                      startSize: subcopyNode.fontSize || typo.subcopy,
                      minSize: 16,
                      fontStyle: theme.subcopyWeight === "bold" ? "bold" : "normal",
                      lineHeight: 1.16,
                      fontFamily: theme.fontFamily,
                      padding: TXT_PAD,
                    })}
                    lineHeight={1.16}
                    wrap="word"
                    fill="#222"
                    fontStyle={theme.subcopyWeight === "bold" ? "bold" : "normal"}
                    letterSpacing={theme.subcopyLetterSpacing || 0}
                    draggable
                    rotation={0}
                    onClick={() => setSelectedId("subcopy")}
                    onTap={() => setSelectedId("subcopy")}
                    onDragEnd={(e) => handleDragEnd("subcopy", e)}
                    onTransformEnd={() => handleTransformEnd("subcopy")}
                  />
                )}

                {/* CTA */}
                {hasCTA && ctaNode && (
                  <>
                    <Rect
                      ref={(r) => (shapeRefs.current["cta"] = r)}
                      x={ctaNode.x}
                      y={ctaNode.y}
                      width={ctaNode.w}
                      height={ctaNode.h}
                      fill={accent}
                      cornerRadius={18}
                      draggable
                      rotation={0}
                      onClick={() => setSelectedId("cta")}
                      onTap={() => setSelectedId("cta")}
                      onDragEnd={(e) => handleDragEnd("cta", e)}
                      onTransformEnd={() => handleTransformEnd("cta")}
                    />
                    <Text
                      x={ctaNode.x}
                      y={ctaNode.y + Math.max(8, (ctaNode.h - typo.cta) / 2)}
                      width={ctaNode.w}
                      align="center"
                      text={cta}
                      fontFamily={theme.fontFamily}
                      fontSize={typo.cta}
                      fill="#fff"
                      fontStyle="bold"
                      listening={false}
                    />
                  </>
                )}

                {/* legal */}
                {legalNode && legalLine?.trim() && (
                  <Text
                    ref={(r) => (shapeRefs.current["legal"] = r)}
                    x={legalNode.x}
                    y={legalNode.y}
                    width={legalNode.w}
                    padding={TXT_PAD}
                    text={legalLine}
                    fontFamily={theme.fontFamily}
                    fontSize={fitFontSizeToBox({
                      text: legalLine,
                      width: legalNode.w,
                      height: legalNode.h,
                      startSize: legalNode.fontSize || typo.legal,
                      minSize: 12,
                      fontStyle: "normal",
                      lineHeight: 1.15,
                      fontFamily: theme.fontFamily,
                      padding: TXT_PAD,
                    })}
                    lineHeight={1.15}
                    fill="rgba(17,17,17,0.85)"
                    wrap="word"
                    draggable
                    rotation={0}
                    onClick={() => setSelectedId("legal")}
                    onTap={() => setSelectedId("legal")}
                    onDragEnd={(e) => handleDragEnd("legal", e)}
                    onTransformEnd={() => handleTransformEnd("legal")}
                  />
                )}

                <Transformer
                  ref={trRef}
                  rotateEnabled={selectedId ? ROTATE_IDS.has(selectedId) : false}
                  enabledAnchors={[
                    "top-left",
                    "top-right",
                    "bottom-left",
                    "bottom-right",
                    "middle-left",
                    "middle-right",
                    "top-center",
                    "bottom-center",
                  ]}
                  boundBoxFunc={(oldBox, newBox) => {
                    if (newBox.width < 30 || newBox.height < 20) return oldBox;
                    return newBox;
                  }}
                />
              </Layer>
            </Stage>
          </FitStage>
        </aside>
      </div>
    </section>
  );
}
