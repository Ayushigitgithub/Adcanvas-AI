// src/pages/SetupPage.jsx
import React, { useMemo, useRef } from "react";
import { TEMPLATES } from "../templates";

const SIZE_PRESETS = [
  { id: "ig_square", label: "IG Post • 1080×1080", w: 1080, h: 1080, platforms: ["Instagram"] },
  { id: "ig_story", label: "IG Story/Reel • 1080×1920", w: 1080, h: 1920, platforms: ["Instagram", "TikTok"] },
  { id: "ig_portrait", label: "IG Portrait • 1080×1350", w: 1080, h: 1350, platforms: ["Instagram"] },
  { id: "fb_feed", label: "FB Feed • 1200×628", w: 1200, h: 628, platforms: ["Facebook", "Display"] },
  { id: "disp_300x250", label: "Display • 300×250", w: 300, h: 250, platforms: ["Display"] },
  { id: "disp_728x90", label: "Display • 728×90", w: 728, h: 90, platforms: ["Display"] },
];

const PLATFORMS = ["Instagram", "Facebook", "TikTok", "Display"];
const OBJECTIVES = ["Awareness", "Consideration", "Conversion"];

// ✅ Separate: Visual style (affects design) vs Tone (AI copy)
const VISUAL_STYLES = ["Bold & modern", "Minimal & premium", "Playful", "Trustworthy"];
const TONES = ["Bold & modern", "Minimal & premium", "Playful", "Trustworthy"];

function makeObjectUrl(file) {
  if (!file) return { name: "", url: "" };
  return { name: file.name, url: URL.createObjectURL(file) };
}

function presetsForPlatform(platform) {
  const p = platform || "Instagram";
  const list = SIZE_PRESETS.filter((s) => s.platforms.includes(p));
  return list.length ? list : SIZE_PRESETS;
}

export default function SetupPage({ campaign, onCampaignChange, onNavigate }) {
  const prevUrlsRef = useRef({
    packshotUrl: campaign.packshotUrl || "",
    backgroundUrl: campaign.backgroundUrl || "",
    logoUrl: campaign.logoUrl || "",
  });

  const activeTemplate = useMemo(
    () => TEMPLATES.find((t) => t.id === campaign.templateId) || TEMPLATES[0],
    [campaign.templateId]
  );

  const platform = campaign.platform || "Instagram";
  const allowedPresets = useMemo(() => presetsForPlatform(platform), [platform]);

  const activeSize = useMemo(() => {
    const id = campaign.editor?.sizePreset;
    const found = allowedPresets.find((s) => s.id === id);
    return found || allowedPresets[0];
  }, [allowedPresets, campaign.editor?.sizePreset]);

  const sizeLabel = `${activeSize.w}×${activeSize.h}`;
  const hasCTA = Boolean(activeTemplate?.hasCTA);

  const setSizePreset = (sizeId) => {
    const s = allowedPresets.find((x) => x.id === sizeId) || allowedPresets[0];
    onCampaignChange?.((prev) => ({
      ...prev,
      editor: {
        ...(prev.editor || {}),
        sizePreset: s.id,
        canvasWidth: s.w,
        canvasHeight: s.h,
      },
    }));
  };

  const replaceAsset = (keyName, file) => {
    const { name, url } = makeObjectUrl(file);

    onCampaignChange?.((prev) => {
      const oldUrl = prev[keyName] || "";
      if (oldUrl && oldUrl.startsWith("blob:")) URL.revokeObjectURL(oldUrl);

      const nameKey =
        keyName === "packshotUrl"
          ? "packshotName"
          : keyName === "backgroundUrl"
          ? "backgroundName"
          : "logoName";

      const nextEditor =
        keyName === "packshotUrl"
          ? { ...(prev.editor || {}), packshotNoBgUrl: "", packshotNoBgSource: "" }
          : (prev.editor || {});

      return {
        ...prev,
        [nameKey]: name,
        [keyName]: url,
        editor: nextEditor,
      };
    });

    prevUrlsRef.current[keyName] = url;
  };

  const onPlatformChange = (nextPlatform) => {
    onCampaignChange?.((prev) => {
      const nextAllowed = presetsForPlatform(nextPlatform);
      const current = prev.editor?.sizePreset;
      const stillValid = nextAllowed.some((s) => s.id === current);
      const pick = stillValid ? nextAllowed.find((s) => s.id === current) : nextAllowed[0];

      return {
        ...prev,
        platform: nextPlatform,
        editor: {
          ...(prev.editor || {}),
          sizePreset: pick.id,
          canvasWidth: pick.w,
          canvasHeight: pick.h,
        },
      };
    });
  };

  return (
    <div className="page-card">
      <div className="setup-top">
        <div>
          <div className="badge-soft">STEP 1 · SETUP</div>
          <h2>Campaign Setup</h2>
        </div>

        <button className="primary-btn" type="button" onClick={() => onNavigate?.("builder")}>
          Next: Builder →
        </button>
      </div>

      <div className="page-grid">
        {/* LEFT */}
        <div className="form-column">
          <div className="field">
            <label>Platform</label>
            <select className="select-input" value={platform} onChange={(e) => onPlatformChange(e.target.value)}>
              {PLATFORMS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Creative size</label>
            <select className="select-input" value={activeSize.id} onChange={(e) => setSizePreset(e.target.value)}>
              {allowedPresets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Template</label>
            <select
              className="select-input"
              value={campaign.templateId || TEMPLATES[0].id}
              onChange={(e) => onCampaignChange?.((p) => ({ ...p, templateId: e.target.value }))}
            >
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || t.label || t.id}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Objective</label>
            <select
              className="select-input"
              value={campaign.objective || ""}
              onChange={(e) => onCampaignChange?.((p) => ({ ...p, objective: e.target.value }))}
            >
              <option value="">Select</option>
              {OBJECTIVES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Brand / Advertiser</label>
            <input
              className="text-input"
              value={campaign.brandName || ""}
              placeholder="e.g. The Brands"
              onChange={(e) => onCampaignChange?.((p) => ({ ...p, brandName: e.target.value }))}
            />
          </div>

          <div className="field">
            <label>Primary color</label>
            <div className="color-row">
              <input
                className="color-swatch"
                type="color"
                value={campaign.primaryColor || "#2563eb"}
                onChange={(e) => onCampaignChange?.((p) => ({ ...p, primaryColor: e.target.value }))}
                aria-label="Primary color"
              />
              <input
                className="text-input color-hex"
                value={campaign.primaryColor || "#2563eb"}
                onChange={(e) => onCampaignChange?.((p) => ({ ...p, primaryColor: e.target.value }))}
              />
            </div>
          </div>

          {/* ✅ Visual style affects fonts/visuals in Builder */}
          <div className="field">
            <label>Visual style</label>
            <select
              className="select-input"
              value={campaign.visualStyle || VISUAL_STYLES[0]}
              onChange={(e) => onCampaignChange?.((p) => ({ ...p, visualStyle: e.target.value }))}
            >
              {VISUAL_STYLES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>

          {/* ✅ Tone affects AI copy only */}
          <div className="field">
            <label>Tone (AI copy)</label>
            <select
              className="select-input"
              value={campaign.tone || TONES[0]}
              onChange={(e) => onCampaignChange?.((p) => ({ ...p, tone: e.target.value }))}
            >
              {TONES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="checkbox"
                checked={Boolean(campaign.removeBg)}
                onChange={(e) => onCampaignChange?.((p) => ({ ...p, removeBg: e.target.checked }))}
              />
              Prefer packshot background removal
            </label>
          </div>

          <div className="field">
            <label>Logo (optional)</label>
            <input className="file-input" type="file" accept="image/*" onChange={(e) => replaceAsset("logoUrl", e.target.files?.[0])} />
          </div>

          <div className="field">
            <label>Packshot</label>
            <input className="file-input" type="file" accept="image/*" onChange={(e) => replaceAsset("packshotUrl", e.target.files?.[0])} />
          </div>

          <div className="field">
            <label>Background (optional)</label>
            <input className="file-input" type="file" accept="image/*" onChange={(e) => replaceAsset("backgroundUrl", e.target.files?.[0])} />
          </div>
        </div>

        {/* RIGHT */}
        <div className="setup-right">
          <div className="setup-sidecard">
            <div className="side-head">
              <div className="side-title">{campaign.brandName || "Preview"}</div>
              <span className="side-dot" style={{ background: campaign.primaryColor || "#2563eb" }} />
            </div>

            <div className="chip-row">
              <span className="chip">{platform}</span>
              <span className="chip">{sizeLabel}</span>
              <span className="chip">{campaign.visualStyle || VISUAL_STYLES[0]}</span>
              <span className="chip">{campaign.tone || TONES[0]}</span>
            </div>

            <div className="asset-preview-row">
              <div className="mini-asset">
                <div className="mini-label">Logo</div>
                <div className="mini-box">
                  {campaign.logoUrl ? <img className="mini-img" src={campaign.logoUrl} alt="Logo preview" /> : <span className="mini-empty">—</span>}
                </div>
              </div>

              <div className="mini-asset">
                <div className="mini-label">Packshot</div>
                <div className="mini-box">
                  {campaign.packshotUrl ? <img className="mini-img" src={campaign.packshotUrl} alt="Packshot preview" /> : <span className="mini-empty">Upload</span>}
                </div>
              </div>

              <div className="mini-asset">
                <div className="mini-label">BG</div>
                <div className="mini-box">
                  {campaign.backgroundUrl ? <img className="mini-img" src={campaign.backgroundUrl} alt="Background preview" /> : <span className="mini-empty">—</span>}
                </div>
              </div>
            </div>

            {/* ✅ Short only */}
            <div className="rule-compact">
              <div className="rule-item">CTA: <b>{hasCTA ? "Allowed" : "Off"}</b></div>
              <div className="rule-item">Remove BG: <b>{campaign.removeBg ? "On" : "Off"}</b></div>
              <div className="rule-item">Export: PNG/JPEG</div>
            </div>

            <button className="primary-btn" type="button" onClick={() => onNavigate?.("builder")}>
              Start Builder →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
