// src/App.js
import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import SetupPage from "./pages/SetupPage";
import BuilderPage from "./pages/BuilderPage";
import ReviewPage from "./pages/ReviewPage";

const STORAGE_KEY = "adcanvas_brand_prefs_v1";

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export default function App() {
  const [activePage, setActivePage] = useState("setup");
  const saved = useMemo(() => loadPrefs(), []);

  const [campaign, setCampaign] = useState({
    platform: "",
    objective: "",
    brandName: "",
    primaryColor: "#2563eb",
    tone: "Bold & modern",

    packshotName: "",
    packshotUrl: "",

    backgroundName: "",
    backgroundUrl: "",

    palette: Array.isArray(saved?.palette) ? saved.palette : [],

    templateId: "neutral-cta",

    editor: {
      sizePreset: "ig_square",
      canvasWidth: 1080,
      canvasHeight: 1080,
      nodes: [],
    },
  });

  useEffect(() => {
    savePrefs({ palette: campaign.palette });
  }, [campaign.palette]);

  // Soft status only (no blocking)
  const hasBasicSetup = Boolean(
    campaign.platform || campaign.objective || campaign.brandName
  );
  const hasAssets = Boolean(campaign.packshotUrl || campaign.backgroundUrl);
  const isDemoMode = !hasBasicSetup || !hasAssets;

  const go = (next) => setActivePage(next);

  const renderPage = () => {
    if (activePage === "builder") {
      return (
        <BuilderPage
          campaign={campaign}
          onCampaignChange={setCampaign}
          onNavigate={go}
        />
      );
    }

    if (activePage === "review") {
      return (
        <ReviewPage
          campaign={campaign}
          onCampaignChange={setCampaign}
          onNavigate={go}
        />
      );
    }

    return (
      <SetupPage
        campaign={campaign}
        onCampaignChange={setCampaign}
        onNavigate={go}
      />
    );
  };

  return (
    <div className="app-root">
      <header className="top-bar">
        <div className="brand">
          <span className="brand-mark" />
          <div className="brand-text">
            {/* ✅ Option A: plain title, no span */}
            <div className="brand-title">AdCanvas AI</div>
            {/* ✅ removed brand-sub completely (no "New campaign") */}
          </div>
        </div>

        <div className="nav-shell">
          <button
            className={"nav-button" + (activePage === "setup" ? " active" : "")}
            onClick={() => go("setup")}
            type="button"
          >
            Setup
          </button>

          <button
            className={
              "nav-button" + (activePage === "builder" ? " active" : "")
            }
            onClick={() => go("builder")}
            type="button"
          >
            Builder
          </button>

          <button
            className={"nav-button" + (activePage === "review" ? " active" : "")}
            onClick={() => go("review")}
            type="button"
          >
            Review
          </button>
        </div>
      </header>

      {activePage !== "setup" && isDemoMode && (
        <div className="app-banner">
          <div className="app-banner-title">Demo mode</div>
          <div className="app-banner-text">
            You can explore {activePage} without uploads. For full AI layout +
            compliance, add platform/objective and upload packshot/background in
            Setup.
          </div>
          <button
            className="app-banner-btn"
            onClick={() => go("setup")}
            type="button"
          >
            Go to Setup
          </button>
        </div>
      )}

      <main className="page-container">{renderPage()}</main>
    </div>
  );
}
