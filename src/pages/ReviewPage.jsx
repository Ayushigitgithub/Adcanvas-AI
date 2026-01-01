// src/pages/ReviewPage.jsx
import React, {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  useImperativeHandle,
  useCallback,
} from "react";
import { Stage, Layer, Rect, Text, Image as KonvaImage } from "react-konva";
import { TEMPLATES } from "../templates";

/* ---------------- Platform-aware presets ---------------- */
const PLATFORM_PRESETS = {
  instagram: [
    { id: "ig_square", label: "IG Post", w: 1080, h: 1080 },
    { id: "ig_story", label: "IG Story", w: 1080, h: 1920 },
    { id: "ig_portrait", label: "IG Portrait", w: 1080, h: 1350 },
    { id: "fb_feed", label: "FB Feed", w: 1200, h: 628 },
  ],
  facebook: [
    { id: "fb_feed", label: "FB Feed", w: 1200, h: 628 },
    { id: "fb_story", label: "FB Story", w: 1080, h: 1920 },
    { id: "fb_square", label: "FB Square", w: 1080, h: 1080 },
    { id: "fb_cover", label: "FB Cover", w: 820, h: 312 },
  ],
  tiktok: [
    { id: "tt_9x16", label: "TikTok 9:16", w: 1080, h: 1920 },
    { id: "tt_story", label: "TikTok Story 9:16", w: 1080, h: 1920 },
    { id: "shorts_9x16", label: "Shorts 9:16", w: 1080, h: 1920 },
    { id: "reels_9x16", label: "Reels 9:16", w: 1080, h: 1920 },
  ],
  display: [
    { id: "d_300x250", label: "Display 300×250", w: 300, h: 250 },
    { id: "d_336x280", label: "Display 336×280", w: 336, h: 280 },
    { id: "d_728x90", label: "Leaderboard 728×90", w: 728, h: 90 },
    { id: "d_160x600", label: "Skyscraper 160×600", w: 160, h: 600 },
  ],
};

const DEFAULT_PRESETS = PLATFORM_PRESETS.instagram;

function normalizePlatform(p) {
  const raw = String(p || "").toLowerCase().trim();
  const cleaned = raw.replace(/[^a-z]/g, "");
  if (cleaned.includes("insta") || cleaned === "ig") return "instagram";
  if (cleaned.includes("face") || cleaned === "fb") return "facebook";
  if (cleaned.includes("tiktok") || cleaned === "tt") return "tiktok";
  if (
    cleaned.includes("display") ||
    cleaned.includes("banner") ||
    cleaned.includes("programmatic")
  )
    return "display";
  return cleaned;
}

// ---------- utils ----------
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function scaleNodes(nodes, fromW, fromH, toW, toH) {
  const sx = toW / fromW;
  const sy = toH / fromH;
  const sFont = (sx + sy) / 2;

  return (nodes || []).map((n) => {
    const out = { ...n };
    if (typeof out.x === "number") out.x *= sx;
    if (typeof out.y === "number") out.y *= sy;
    if (typeof out.w === "number") out.w *= sx;
    if (typeof out.h === "number") out.h *= sy;
    if (typeof out.fontSize === "number") {
      out.fontSize = clamp(Math.round(out.fontSize * sFont), 14, 220);
    }
    return out;
  });
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

function useLoadedImage(url) {
  const [img, setImg] = useState(null);

  useEffect(() => {
    if (!url) {
      setImg(null);
      return;
    }

    let cancelled = false;
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => !cancelled && setImg(image);
    image.onerror = () => !cancelled && setImg(null);
    image.src = url;

    return () => {
      cancelled = true;
    };
  }, [url]);

  return img;
}

// ---------- layout + autofix helpers ----------
function inferLayoutIdFromNodes(sourceNodes, sourceW) {
  const pack = (sourceNodes || []).find((n) => n.id === "packshot");
  if (!pack || !sourceW) return "left-packshot";
  const cx = (pack.x || 0) + (pack.w || 0) / 2;
  if (cx > sourceW * 0.35 && cx < sourceW * 0.65) return "center-packshot";
  if (cx < sourceW / 2) return "left-packshot";
  return "right-packshot";
}

function buildBaselineNodes({ layoutId, canvasW, canvasH, SAFE, hasCTA }) {
  const safeX = SAFE;
  const safeY = SAFE;
  const safeW = canvasW - SAFE * 2;
  const safeH = canvasH - SAFE * 2;

  const gap = Math.round(safeW * 0.05);
  const packW = Math.round(safeW * 0.40);
  const packH = Math.round(safeH * 0.54);
  const textW = Math.round(safeW - packW - gap);

  const typo = {
    brand: clamp(Math.round(canvasH * 0.030), 16, 56),
    headline: clamp(Math.round(canvasH * 0.085), 34, 200),
    subcopy: clamp(Math.round(canvasH * 0.034), 16, 90),
    offer: clamp(Math.round(canvasH * 0.030), 14, 60),
    legal: clamp(Math.round(canvasH * 0.020), 12, 30),
    cta: clamp(Math.round(canvasH * 0.028), 14, 40),
  };

  const base = [];

  if (layoutId === "center-packshot") {
    const stackW = Math.round(safeW * 0.90);
    const stackX = safeX + Math.round((safeW - stackW) / 2);

    base.push({
      id: "packshot",
      type: "image",
      x: safeX + Math.round(safeW * 0.32),
      y: safeY + Math.round(safeH * 0.12),
      w: Math.round(safeW * 0.36),
      h: Math.round(safeH * 0.30),
      rotation: 0,
    });
    base.push({
      id: "logo",
      type: "image",
      x: stackX,
      y: safeY,
      w: Math.round(stackW * 0.28),
      h: Math.round(safeH * 0.10),
      rotation: 0,
    });
    base.push({
      id: "brand",
      type: "tag",
      x: stackX,
      y: safeY,
      w: stackW,
      h: Math.round(Math.max(52, canvasH * 0.06)),
      rotation: 0,
      fontSize: typo.brand,
    });
    base.push({
      id: "offer",
      type: "text",
      x: stackX,
      y: safeY + Math.round(safeH * 0.46),
      w: stackW,
      h: Math.round(safeH * 0.08),
      rotation: 0,
      fontSize: typo.offer,
    });
    base.push({
      id: "headline",
      type: "text",
      x: stackX,
      y: safeY + Math.round(safeH * 0.54),
      w: stackW,
      h: Math.round(safeH * 0.18),
      rotation: 0,
      fontSize: typo.headline,
    });
    base.push({
      id: "subcopy",
      type: "text",
      x: stackX,
      y: safeY + Math.round(safeH * 0.72),
      w: stackW,
      h: Math.round(safeH * 0.10),
      rotation: 0,
      fontSize: typo.subcopy,
    });
    if (hasCTA) {
      base.push({
        id: "cta",
        type: "cta",
        x: stackX,
        y: safeY + Math.round(safeH * 0.84),
        w: Math.round(stackW * 0.42),
        h: Math.round(Math.max(52, canvasH * 0.06)),
        rotation: 0,
      });
    }
    base.push({
      id: "legal",
      type: "text",
      x: safeX,
      y: safeY + safeH - Math.round(safeH * 0.07),
      w: safeW,
      h: Math.round(safeH * 0.07),
      rotation: 0,
      fontSize: typo.legal,
    });
    return base;
  }

  const isLeft = layoutId === "left-packshot";
  const packX = isLeft ? safeX : safeX + safeW - packW;
  const textX = isLeft ? safeX + packW + gap : safeX;

  base.push({
    id: "packshot",
    type: "image",
    x: packX,
    y: safeY + Math.round(safeH * 0.18),
    w: packW,
    h: packH,
    rotation: 0,
  });
  base.push({
    id: "logo",
    type: "image",
    x: textX,
    y: safeY,
    w: Math.round(textW * 0.35),
    h: Math.round(safeH * 0.10),
    rotation: 0,
  });
  base.push({
    id: "brand",
    type: "tag",
    x: isLeft ? safeX + Math.round(safeW * 0.72) : safeX + Math.round(safeW * 0.10),
    y: safeY,
    w: isLeft ? Math.round(safeW * 0.26) : Math.round(safeW * 0.30),
    h: Math.round(Math.max(52, canvasH * 0.06)),
    rotation: 0,
    fontSize: typo.brand,
  });
  base.push({
    id: "offer",
    type: "text",
    x: textX,
    y: safeY + Math.round(safeH * 0.12),
    w: textW,
    h: Math.round(safeH * 0.10),
    rotation: 0,
    fontSize: typo.offer,
  });
  base.push({
    id: "headline",
    type: "text",
    x: textX,
    y: safeY + Math.round(safeH * 0.22),
    w: textW,
    h: Math.round(safeH * 0.30),
    rotation: 0,
    fontSize: typo.headline,
  });
  base.push({
    id: "subcopy",
    type: "text",
    x: textX,
    y: safeY + Math.round(safeH * 0.55),
    w: textW,
    h: Math.round(safeH * 0.18),
    rotation: 0,
    fontSize: typo.subcopy,
  });
  if (hasCTA) {
    base.push({
      id: "cta",
      type: "cta",
      x: textX,
      y: safeY + Math.round(safeH * 0.78),
      w: Math.round(textW * 0.66),
      h: Math.round(Math.max(52, canvasH * 0.06)),
      rotation: 0,
    });
  }
  base.push({
    id: "legal",
    type: "text",
    x: safeX,
    y: safeY + safeH - Math.round(safeH * 0.07),
    w: safeW,
    h: Math.round(safeH * 0.07),
    rotation: 0,
    fontSize: typo.legal,
  });

  return base;
}

function autoFixNodesToSafe({ nodes, SAFE, canvasW, canvasH, mustBeSafeIds }) {
  const safeX = SAFE;
  const safeY = SAFE;
  const safeW = canvasW - SAFE * 2;
  const safeH = canvasH - SAFE * 2;

  const fixedIds = new Set();

  const out = (nodes || []).map((n) => {
    if (!n) return n;
    let x = typeof n.x === "number" ? n.x : 0;
    let y = typeof n.y === "number" ? n.y : 0;
    let w = typeof n.w === "number" ? n.w : 0;
    let h = typeof n.h === "number" ? n.h : 0;

    if (w <= 0) w = Math.max(40, Math.round(canvasW * 0.2));
    if (h <= 0) h = Math.max(30, Math.round(canvasH * 0.08));

    const mustBeSafe = mustBeSafeIds.includes(n.id);

    if (mustBeSafe) {
      const nw = Math.min(w, safeW);
      const nh = Math.min(h, safeH);
      if (nw !== w || nh !== h) fixedIds.add(n.id);
      w = nw;
      h = nh;

      const nx = clamp(x, safeX, safeX + safeW - w);
      const ny = clamp(y, safeY, safeY + safeH - h);
      if (nx !== x || ny !== y) fixedIds.add(n.id);
      x = nx;
      y = ny;
    } else {
      x = clamp(x, 0, canvasW - w);
      y = clamp(y, 0, canvasH - h);
    }

    return { ...n, x, y, w, h };
  });

  return { nodes: out, fixedIds: Array.from(fixedIds) };
}

// ---------- compliance (AUDIT + FINAL) ----------
function computeSafeAlerts({ nodes, SAFE, canvasW, canvasH, mustBeSafeIds }) {
  const issues = [];
  const notes = [];

  const insideSafe = (n) => {
    if (!n) return false;
    const l = n.x,
      t = n.y,
      r = n.x + n.w,
      b = n.y + n.h;
    return l >= SAFE && t >= SAFE && r <= canvasW - SAFE && b <= canvasH - SAFE;
  };

  // Missing node check
  mustBeSafeIds.forEach((id) => {
    const n = nodes.find((x) => x.id === id);
    if (!n) issues.push(`${id} missing`);
    else if (!insideSafe(n)) issues.push(`${id} outside safe area`);
  });

  return { issues, notes };
}

// ---------- VariantCard ----------
const VariantCard = forwardRef(function VariantCard(
  {
    preset,
    campaign,
    template,
    sourceW,
    sourceH,
    sourceNodes,
    sourceCopy,
    onStatusChange,
    onFixInBuilder,
    showGuides = false,
  },
  ref
) {
  const canvasW = preset.w;
  const canvasH = preset.h;
  const SAFE = Math.round(Math.min(canvasW, canvasH) * 0.06);

  const hasCTA = Boolean(template?.hasCTA);

  const packshotUrl = campaign?.editor?.packshotNoBgUrl || campaign?.packshotUrl;
  const bgImg = useLoadedImage(campaign?.backgroundUrl);
  const packImg = useLoadedImage(packshotUrl);
  const logoImg = useLoadedImage(campaign?.logoUrl);

  const stageRef = useRef(null);
  const guidesLayerRef = useRef(null);

  const brand = campaign?.brandName || "Brand";
  const accent = campaign?.primaryColor || "#2563eb";

  const THUMB_MAX_W = 260;
  const THUMB_MAX_H = 260;
  const previewScale = Math.min(THUMB_MAX_W / canvasW, THUMB_MAX_H / canvasH);
  const thumbW = Math.round(canvasW * previewScale);
  const thumbH = Math.round(canvasH * previewScale);

  const headline = sourceCopy?.headline || "Your headline";
  const subcopy = sourceCopy?.subcopy || "Add supporting copy";
  const cta = sourceCopy?.cta || "Learn more";
  const offerLine = sourceCopy?.offerLine || "";
  const legalLine = sourceCopy?.legalLine || "";

  const editorLayout = campaign?.editor?.layout;
  const inferredLayout = useMemo(
    () => inferLayoutIdFromNodes(sourceNodes, sourceW),
    [sourceNodes, sourceW]
  );
  const layoutId = editorLayout || inferredLayout;

  // Must-be-safe elements (CTA only if template allows)
  const mustBeSafeIds = useMemo(() => {
    const ids = ["brand", "headline", "subcopy"];
    // logo should be safe IF present; still audit it
    ids.push("logo");
    if (offerLine?.trim()) ids.push("offer");
    if (legalLine?.trim()) ids.push("legal");
    if (hasCTA) ids.push("cta");
    return ids;
  }, [offerLine, legalLine, hasCTA]);

  const { finalNodes, auditIssues, fixedIds, finalIssues, finalNotes } = useMemo(() => {
    const base = () => buildBaselineNodes({ layoutId, canvasW, canvasH, SAFE, hasCTA });

    let rawCandidate;
    if (!Array.isArray(sourceNodes) || !sourceNodes.length || !sourceW || !sourceH) {
      rawCandidate = base();
    } else {
      const srcAR = sourceW / sourceH;
      const dstAR = canvasW / canvasH;
      const ratio = dstAR / srcAR;
      const significantChange = ratio > 1.35 || ratio < 0.74;

      rawCandidate = significantChange
        ? base()
        : scaleNodes(sourceNodes, sourceW, sourceH, canvasW, canvasH);
    }

    // AUDIT FIRST (before fixing)
    const audit = computeSafeAlerts({
      nodes: rawCandidate,
      SAFE,
      canvasW,
      canvasH,
      mustBeSafeIds,
    });

    // FIX SECOND (for export-ready final)
    const fixed = autoFixNodesToSafe({
      nodes: rawCandidate,
      SAFE,
      canvasW,
      canvasH,
      mustBeSafeIds,
    });

    // FINAL CHECK (after fixing)
    const final = computeSafeAlerts({
      nodes: fixed.nodes,
      SAFE,
      canvasW,
      canvasH,
      mustBeSafeIds,
    });

    const notes = [];
    if (!campaign?.logoUrl) notes.push("Logo not uploaded");
    if (!packshotUrl) notes.push("Packshot not uploaded");
    if (!campaign?.backgroundUrl) notes.push("BG not uploaded");
    if (!hasCTA) notes.push("CTA disabled by template");
    if (fixed.fixedIds.length > 0) notes.push(`Auto-fix applied (${fixed.fixedIds.length})`);

    return {
      finalNodes: fixed.nodes,
      auditIssues: audit.issues,
      fixedIds: fixed.fixedIds,
      finalIssues: final.issues,
      finalNotes: notes,
    };
  }, [
    sourceNodes,
    sourceW,
    sourceH,
    canvasW,
    canvasH,
    SAFE,
    hasCTA,
    offerLine,
    legalLine,
    layoutId,
    mustBeSafeIds,
    campaign?.logoUrl,
    campaign?.backgroundUrl,
    packshotUrl,
  ]);

  const packNode = finalNodes.find((n) => n.id === "packshot");
  const logoNode = finalNodes.find((n) => n.id === "logo");
  const brandNode = finalNodes.find((n) => n.id === "brand");
  const headlineNode = finalNodes.find((n) => n.id === "headline");
  const subcopyNode = finalNodes.find((n) => n.id === "subcopy");
  const ctaNode = finalNodes.find((n) => n.id === "cta");
  const offerNode = finalNodes.find((n) => n.id === "offer");
  const legalNode = finalNodes.find((n) => n.id === "legal");

  const isFinalReady = finalIssues.length === 0;

  // IMPORTANT: show the user what was wrong (audit) even if fixed
  const hadAuditProblems = auditIssues.length > 0;
  const fixedSomething = fixedIds.length > 0;

  const status =
    isFinalReady && hadAuditProblems && fixedSomething
      ? "Compliant (fixed)"
      : isFinalReady
      ? "Compliant"
      : "Needs tweaks";

  useEffect(() => {
    onStatusChange?.(preset.id, {
      id: preset.id,
      label: preset.label,
      status,
      // show audit issues as the "what needs tweak" truth
      issues: isFinalReady ? [] : finalIssues,
      auditIssues,
      notes: finalNotes,
      primaryIssue: (isFinalReady ? auditIssues : finalIssues)[0] || "",
      wasAutoFixed: Boolean(isFinalReady && hadAuditProblems && fixedSomething),
    });
  }, [
    preset.id,
    preset.label,
    status,
    isFinalReady,
    finalIssues,
    auditIssues,
    finalNotes,
    onStatusChange,
    hadAuditProblems,
    fixedSomething,
  ]);

  useEffect(() => {
    const stage = stageRef.current;
    if (stage) stage.draw();
  }, [showGuides]);

  const [lastJpegKb, setLastJpegKb] = useState(null);
  const [lastJpegQ, setLastJpegQ] = useState(null);

  const withGuidesHidden = async (fn) => {
    const guides = guidesLayerRef.current;
    const stage = stageRef.current;
    if (!stage) return null;

    const prevVisible = guides ? guides.visible() : true;
    if (guides) guides.visible(false);
    stage.draw();

    try {
      return await fn(stage);
    } finally {
      if (guides) guides.visible(prevVisible);
      stage.draw();
    }
  };

  const exportPNG = async () => {
    await withGuidesHidden(async (stage) => {
      const dataUrl = stage.toDataURL({ pixelRatio: 1, mimeType: "image/png" });
      const blob = await dataUrlToBlob(dataUrl);
      downloadBlob(blob, `adcanvas_${preset.id}.png`);
      return { ok: true };
    });
  };

  const exportJPEGUnder500KB = async () => {
    const result = await withGuidesHidden(async (stage) => {
      let quality = 0.92;
      let blob = null;

      for (let i = 0; i < 12; i++) {
        const dataUrl = stage.toDataURL({
          pixelRatio: 1,
          mimeType: "image/jpeg",
          quality,
        });
        blob = await dataUrlToBlob(dataUrl);
        if (blob.size <= 500 * 1024) break;

        quality -= 0.07;
        if (quality < 0.35) break;
      }

      if (blob) {
        const kb = Math.round(blob.size / 1024);
        setLastJpegKb(kb);
        setLastJpegQ(Math.round(quality * 100) / 100);
        downloadBlob(blob, `adcanvas_${preset.id}.jpg`);
        return { ok: blob.size <= 500 * 1024, kb, quality };
      }
      return { ok: false, kb: null, quality: null };
    });

    return result || { ok: false, kb: null, quality: null };
  };

  useImperativeHandle(ref, () => ({
    exportPNG,
    exportJPEGUnder500KB,
  }));

  const [fmt, setFmt] = useState("png");
  const download = async () => {
    if (fmt === "png") return exportPNG();
    return exportJPEGUnder500KB();
  };

  const textFont = (n, fallback) => clamp(Math.round(n?.fontSize || fallback), 12, 220);

  const [showAudit, setShowAudit] = useState(false);

  return (
    <div id={`variant-${preset.id}`} className="variant-card compact">
      <div className="variant-thumb compact">
        <div className="stage-preview compact" style={{ width: thumbW, height: thumbH }}>
          <div
            style={{
              width: canvasW,
              height: canvasH,
              transform: `scale(${previewScale})`,
              transformOrigin: "top left",
            }}
          >
            <Stage ref={stageRef} width={canvasW} height={canvasH} style={{ background: "#fff" }}>
              <Layer>
                <Rect x={0} y={0} width={canvasW} height={canvasH} fill="#ffffff" />

                {bgImg ? (
                  <KonvaImage
                    image={bgImg}
                    x={0}
                    y={0}
                    width={canvasW}
                    height={canvasH}
                    crop={getCoverCrop(bgImg, canvasW, canvasH)}
                    listening={false}
                  />
                ) : (
                  <Rect x={0} y={0} width={canvasW} height={canvasH} fill="rgba(0,0,0,0.02)" listening={false} />
                )}

                {packNode &&
                  (packImg ? (
                    <KonvaImage
                      image={packImg}
                      x={packNode.x}
                      y={packNode.y}
                      width={packNode.w}
                      height={packNode.h}
                      rotation={packNode.rotation || 0}
                      listening={false}
                    />
                  ) : (
                    <Rect
                      x={packNode.x}
                      y={packNode.y}
                      width={packNode.w}
                      height={packNode.h}
                      fill="rgba(0,0,0,0.04)"
                      listening={false}
                    />
                  ))}

                {logoNode && logoImg && (
                  <KonvaImage
                    image={logoImg}
                    x={logoNode.x}
                    y={logoNode.y}
                    width={logoNode.w}
                    height={logoNode.h}
                    listening={false}
                  />
                )}

                {brandNode && (
                  <>
                    <Rect
                      x={brandNode.x}
                      y={brandNode.y}
                      width={brandNode.w}
                      height={brandNode.h}
                      fill="rgba(255,255,255,0.86)"
                      cornerRadius={12}
                      listening={false}
                    />
                    <Text
                      x={brandNode.x + 12}
                      y={brandNode.y + Math.max(8, Math.round(brandNode.h * 0.22))}
                      text={brand}
                      fontSize={textFont(brandNode, Math.round(canvasH * 0.03))}
                      fill={accent}
                      fontStyle="bold"
                      listening={false}
                      ellipsis
                      width={brandNode.w - 24}
                    />
                  </>
                )}

                {offerNode && offerLine?.trim() && (
                  <Text
                    x={offerNode.x}
                    y={offerNode.y}
                    width={offerNode.w}
                    height={offerNode.h}
                    text={offerLine}
                    fontSize={textFont(offerNode, Math.round(canvasH * 0.03))}
                    fill="#111"
                    fontStyle="bold"
                    listening={false}
                  />
                )}

                {headlineNode && (
                  <Text
                    x={headlineNode.x}
                    y={headlineNode.y}
                    width={headlineNode.w}
                    height={headlineNode.h}
                    text={headline}
                    fontSize={textFont(headlineNode, Math.round(canvasH * 0.06))}
                    fill="#111"
                    fontStyle="bold"
                    listening={false}
                    wrap="word"
                  />
                )}

                {subcopyNode && (
                  <Text
                    x={subcopyNode.x}
                    y={subcopyNode.y}
                    width={subcopyNode.w}
                    height={subcopyNode.h}
                    text={subcopy}
                    fontSize={textFont(subcopyNode, Math.round(canvasH * 0.03))}
                    fill="#222"
                    listening={false}
                    wrap="word"
                  />
                )}

                {hasCTA && ctaNode && (
                  <>
                    <Rect
                      x={ctaNode.x}
                      y={ctaNode.y}
                      width={ctaNode.w}
                      height={ctaNode.h}
                      fill={accent}
                      cornerRadius={18}
                      listening={false}
                    />
                    <Text
                      x={ctaNode.x}
                      y={ctaNode.y + Math.max(10, Math.round(ctaNode.h * 0.26))}
                      width={ctaNode.w}
                      align="center"
                      text={cta}
                      fontSize={clamp(Math.round(canvasH * 0.028), 14, 28)}
                      fill="#fff"
                      fontStyle="bold"
                      listening={false}
                    />
                  </>
                )}

                {legalNode && legalLine?.trim() && (
                  <Text
                    x={legalNode.x}
                    y={legalNode.y}
                    width={legalNode.w}
                    height={legalNode.h}
                    text={legalLine}
                    fontSize={textFont(legalNode, Math.round(canvasH * 0.02))}
                    fill="rgba(17,17,17,0.85)"
                    listening={false}
                    wrap="word"
                  />
                )}
              </Layer>

              <Layer ref={guidesLayerRef} visible={Boolean(showGuides)}>
                <Rect
                  x={SAFE}
                  y={SAFE}
                  width={canvasW - SAFE * 2}
                  height={canvasH - SAFE * 2}
                  stroke="rgba(17,24,39,0.10)"
                  strokeWidth={2}
                  dash={[6, 6]}
                  listening={false}
                />
              </Layer>
            </Stage>
          </div>
        </div>
      </div>

      <div className="variant-meta compact">
        <div className="variant-title">
          {preset.label} • {canvasW}×{canvasH}
        </div>

        <div className="tag-row">
          <span className={`status-chip ${isFinalReady ? "ok" : "warn"}`}>{status}</span>

          {finalNotes.map((n, idx) => (
            <span key={idx} className="status-chip neutral">
              {n}
            </span>
          ))}

          <span className="status-chip neutral">
            JPEG ≤ 500KB
            {lastJpegKb ? ` (${lastJpegKb}KB${lastJpegQ ? `, q=${lastJpegQ}` : ""})` : ""}
          </span>
        </div>

        {/* This is the IMPORTANT part: show audit problems even if auto-fixed */}
        {isFinalReady && hadAuditProblems && (
          <div className="issue-line" style={{ marginTop: 8 }}>
            <span className="issue-dot" />
            <span className="issue-text">
              Had issues originally: {auditIssues[0]}
              {auditIssues.length > 1 ? ` (+${auditIssues.length - 1})` : ""}
            </span>
            <button type="button" className="link-btn" onClick={() => setShowAudit((v) => !v)}>
              {showAudit ? "Hide audit" : "View audit (original)"} →
            </button>
          </div>
        )}

        {showAudit && (
          <div className="review-panel-mini" style={{ marginTop: 8 }}>
            <b>Audit issues (before auto-fix):</b>
            <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
              {auditIssues.map((x, i) => (
                <div key={i}>• {x}</div>
              ))}
            </div>
            <div style={{ marginTop: 8, opacity: 0.85 }}>
              Tip: Use “Show safe area” or “Edit in Builder” to adjust manually.
            </div>
          </div>
        )}

        {!isFinalReady && (
          <div className="issue-line">
            <span className="issue-dot" />
            <span className="issue-text">{finalIssues[0]}</span>
            <button type="button" className="link-btn" onClick={onFixInBuilder}>
              Fix in Builder →
            </button>
          </div>
        )}

        <div className="page-footer compact" style={{ gap: 10 }}>
          <button type="button" className="primary-btn" onClick={download} disabled={!isFinalReady}>
            Download
          </button>

          <select
            className="format-select"
            value={fmt}
            onChange={(e) => setFmt(e.target.value)}
            title="Choose format"
            disabled={!isFinalReady}
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPEG (&lt; 500KB)</option>
          </select>
        </div>
      </div>
    </div>
  );
});

// ---------- ReviewPage ----------
function ReviewPage({ campaign, onNavigate }) {
  const currentTemplate =
    TEMPLATES.find((t) => t.id === campaign?.templateId) || TEMPLATES[0];

  const editor = campaign?.editor || {};
  const sourceW = editor.canvasWidth || 1080;
  const sourceH = editor.canvasHeight || 1080;
  const sourceNodes = Array.isArray(editor.nodes) ? editor.nodes : [];

  const sourceCopy = {
    headline: editor.headline || "",
    subcopy: editor.subcopy || "",
    cta: editor.cta || "Learn more",
    offerLine: editor.offerLine || "",
    legalLine: editor.legalLine || "",
  };

  const SIZE_PRESETS = useMemo(() => {
    const key = normalizePlatform(campaign?.platform);
    const presets = PLATFORM_PRESETS[key] || DEFAULT_PRESETS;
    return presets.slice(0, 4);
  }, [campaign?.platform]);

  const cardRefs = useRef({});
  const getCardRef = (id) => {
    if (!cardRefs.current[id]) cardRefs.current[id] = React.createRef();
    return cardRefs.current[id];
  };

  const [statusMap, setStatusMap] = useState({});
  const onStatusChange = (id, status) => setStatusMap((p) => ({ ...p, [id]: status }));

  const computedSummary = useMemo(() => {
    const list = SIZE_PRESETS.map((p) => statusMap[p.id]).filter(Boolean);
    const total = SIZE_PRESETS.length;
    const compliant = list.filter((s) =>
      String(s?.status || "").toLowerCase().includes("compliant")
    ).length;
    const needs = total - compliant;
    const autoFixed = list.filter((s) => Boolean(s?.wasAutoFixed)).length;

    const firstFail = SIZE_PRESETS.find(
      (p) => String(statusMap[p.id]?.status || "").toLowerCase() === "needs tweaks"
    );

    return {
      total,
      compliant,
      needs,
      autoFixed,
      firstFailId: firstFail?.id || null,
      firstFailText: firstFail
        ? `${firstFail.label}: ${statusMap[firstFail.id]?.primaryIssue}`
        : "",
    };
  }, [statusMap, SIZE_PRESETS]);

  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState("");
  const [showOnlyIssues, setShowOnlyIssues] = useState(false);
  const [showGuides, setShowGuides] = useState(false);

  // ✅ Product-style bulk export UI (collapsed by default)
  const [bulkExportSummary, setBulkExportSummary] = useState("");
  const [bulkExportDetails, setBulkExportDetails] = useState("");
  const [showBulkExportDetails, setShowBulkExportDetails] = useState(false);

  const allStatusesReady = useMemo(() => {
    return SIZE_PRESETS.every((p) => Boolean(statusMap[p.id]));
  }, [statusMap, SIZE_PRESETS]);

  // FIX: clear stale scan/export message when campaign/presets changes
  useEffect(() => {
    setRunMsg("");
    setBulkExportSummary("");
    setBulkExportDetails("");
    setShowBulkExportDetails(false);
  }, [campaign?.platform, campaign?.templateId, SIZE_PRESETS.length]);

  const runCompliance = useCallback(
    async ({ scroll = true } = {}) => {
      try {
        setRunning(true);
        setRunMsg("");
        await new Promise((r) => setTimeout(r, 120));

        setRunMsg(
          computedSummary.needs === 0
            ? `Scan complete • All variants compliant ✅${
                computedSummary.autoFixed ? ` (auto-fixed: ${computedSummary.autoFixed})` : ""
              }`
            : `Scan complete • ${computedSummary.needs} variant needs tweaks.`
        );

        if (scroll && computedSummary.firstFailId) {
          const el = document.getElementById(`variant-${computedSummary.firstFailId}`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } finally {
        setRunning(false);
      }
    },
    [computedSummary.needs, computedSummary.firstFailId, computedSummary.autoFixed]
  );

  const didAutoRunRef = useRef(false);
  useEffect(() => {
    if (didAutoRunRef.current) return;
    if (!allStatusesReady) return;
    didAutoRunRef.current = true;
    runCompliance({ scroll: false });
  }, [allStatusesReady, runCompliance]);

  const exportAllPNG = async () => {
    // clear bulk export UI (so it doesn't look noisy)
    setBulkExportSummary("");
    setBulkExportDetails("");
    setShowBulkExportDetails(false);

    for (const preset of SIZE_PRESETS) {
      const r = cardRefs.current[preset.id]?.current;
      if (r?.exportPNG) {
        // eslint-disable-next-line no-await-in-loop
        await r.exportPNG();
      }
    }
  };

  const exportAllJPEG = async () => {
    setBulkExportSummary("");
    setBulkExportDetails("");
    setShowBulkExportDetails(false);

    const results = [];
    for (const preset of SIZE_PRESETS) {
      const r = cardRefs.current[preset.id]?.current;
      if (r?.exportJPEGUnder500KB) {
        // eslint-disable-next-line no-await-in-loop
        const res = await r.exportJPEGUnder500KB();
        results.push({ id: preset.id, ...res });
      }
    }

    const okCount = results.filter((x) => x.ok).length;

    const detailLine = results
      .map((x) => {
        if (!x.kb) return `${x.id}: —`;
        const q =
          typeof x.quality === "number"
            ? x.quality.toFixed(2)
            : String(x.quality ?? "");
        return `${x.id}: ${x.kb}KB (q=${q})`;
      })
      .join(" • ");

    // ✅ summary looks clean, details are optional
    setBulkExportSummary(
      `Export complete ✅ ${okCount}/${SIZE_PRESETS.length} under 500KB`
    );
    setBulkExportDetails(detailLine);
  };

  const visiblePresets = useMemo(() => {
    if (!showOnlyIssues) return SIZE_PRESETS;
    return SIZE_PRESETS.filter(
      (p) => String(statusMap[p.id]?.status || "").toLowerCase() === "needs tweaks"
    );
  }, [showOnlyIssues, statusMap, SIZE_PRESETS]);

  return (
    <section className="page-card" style={{ paddingBottom: 120 }}>
      <style>{`
        .review-grid-2x2 {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          align-items: start;
        }
        @media (max-width: 980px) {
          .review-grid-2x2 { grid-template-columns: 1fr; }
        }
        .format-select {
          height: 40px;
          border-radius: 12px;
          border: 1px solid rgba(0,0,0,0.12);
          padding: 0 10px;
          background: white;
          font-size: 13px;
        }
      `}</style>

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 280 }}>
          <div className="badge-soft">Step 3 • Review & Export</div>
          <h2 style={{ margin: "6px 0 6px" }}>Review variants</h2>
          <p style={{ marginTop: 0 }}>
            Audit first (shows what to tweak), then export. JPEG targets <b>&lt; 500KB</b>.
          </p>
        </div>

        <div className="review-panel">
          <div className="review-panel-top">
            <span className={`status-chip ${computedSummary.needs === 0 ? "ok" : "warn"}`}>
              {computedSummary.needs === 0 ? "Ready" : "Needs action"}
            </span>
            <span className="status-chip neutral">
              {computedSummary.compliant}/{computedSummary.total} compliant
            </span>
            {computedSummary.autoFixed > 0 && (
              <span className="status-chip neutral">
                Auto-fixed: {computedSummary.autoFixed}
              </span>
            )}
          </div>

          <div className="review-panel-actions">
            <button
              type="button"
              className="primary-btn"
              onClick={exportAllPNG}
              disabled={computedSummary.needs !== 0}
            >
              Export all PNG
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={exportAllJPEG}
              disabled={computedSummary.needs !== 0}
            >
              Export all JPEG (&lt; 500KB)
            </button>
          </div>

          {/* ✅ Clean bulk export UX (summary + optional details) */}
          {bulkExportSummary && (
            <div
              className="review-panel-mini"
              style={{
                marginTop: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
              role="status"
              aria-live="polite"
            >
              <span>{bulkExportSummary}</span>
              {bulkExportDetails && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setShowBulkExportDetails((v) => !v)}
                >
                  {showBulkExportDetails ? "Hide details" : "View details"}{" "}
                  {showBulkExportDetails ? "↑" : "↓"}
                </button>
              )}
            </div>
          )}

          {showBulkExportDetails && bulkExportDetails && (
            <div className="review-panel-mini" style={{ marginTop: 8, opacity: 0.9 }}>
              {bulkExportDetails}
            </div>
          )}

          <div className="review-panel-toggles">
            <button
              type="button"
              className="toggle-btn"
              onClick={() => setShowOnlyIssues((v) => !v)}
            >
              {showOnlyIssues ? "Show all variants" : "Show only issues"}
            </button>

            <button
              type="button"
              className="toggle-btn"
              onClick={() => setShowGuides((v) => !v)}
            >
              {showGuides ? "Hide safe area" : "Show safe area"}
            </button>

            <button
              type="button"
              className="toggle-btn"
              onClick={() => runCompliance({ scroll: true })}
              disabled={running}
            >
              {running ? "Scanning…" : "Rescan"}
            </button>
          </div>

          {runMsg && (
            <div className="review-panel-mini" style={{ marginTop: 8 }}>
              {runMsg}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 10 }}>
        <span className="status-chip neutral">
          <b>Platform:</b> {campaign?.platform || "—"}
        </span>
        <span className="status-chip neutral">
          <b>Template:</b> {currentTemplate?.name || "—"}
        </span>
        <span className="status-chip neutral">
          <b>CTA allowed:</b> {currentTemplate?.hasCTA ? "Yes" : "No"}
        </span>
      </div>

      <div className="review-grid-2x2" style={{ marginTop: 16 }}>
        {visiblePresets.map((preset) => (
          <VariantCard
            key={preset.id}
            ref={getCardRef(preset.id)}
            preset={preset}
            campaign={campaign}
            template={currentTemplate}
            sourceW={sourceW}
            sourceH={sourceH}
            sourceNodes={sourceNodes}
            sourceCopy={sourceCopy}
            onStatusChange={onStatusChange}
            onFixInBuilder={() => onNavigate && onNavigate("builder")}
            showGuides={showGuides}
          />
        ))}

        {showOnlyIssues && visiblePresets.length === 0 && (
          <div style={{ padding: 14, fontSize: 13, color: "rgba(17,24,39,0.65)" }}>
            No issues found ✅ (switch back to “Show all variants”)
          </div>
        )}
      </div>

      <div className="page-footer" style={{ marginTop: 16 }}>
        <button
          type="button"
          className="secondary-btn"
          onClick={() => onNavigate && onNavigate("builder")}
        >
          ← Back to Builder
        </button>
        <button
          type="button"
          className="secondary-btn"
          onClick={() => onNavigate && onNavigate("setup")}
        >
          Back to Setup
        </button>
      </div>
    </section>
  );
}

export default ReviewPage;
