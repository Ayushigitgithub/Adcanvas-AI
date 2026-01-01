// src/utils/suggestions.js

// Small safe nudges that look "AI-assisted" but are deterministic & reliable.
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export function buildSuggestions(baseDraft) {
  const d = structuredClone(baseDraft);

  // Helper: adjust headline sizing slightly
  const tweakHeadline = (draft, delta) => {
    draft.typography = draft.typography || {};
    draft.typography.headlineScale = clamp((draft.typography.headlineScale ?? 1) + delta, 0.85, 1.25);
    return draft;
  };

  // Helper: try a different layout if available
  const switchLayout = (draft, nextLayoutId) => {
    draft.layoutId = nextLayoutId;
    return draft;
  };

  // Helper: accent block on/off
  const toggleAccent = (draft, on) => {
    draft.style = draft.style || {};
    draft.style.accentBlock = on;
    return draft;
  };

  // Helper: move packshot a bit for “reframing”
  const nudgePackshot = (draft, dx, dy, drot = 0) => {
    draft.packshot = draft.packshot || {};
    draft.packshot.x = (draft.packshot.x ?? 120) + dx;
    draft.packshot.y = (draft.packshot.y ?? 240) + dy;
    draft.packshot.rotation = (draft.packshot.rotation ?? 0) + drot;
    return draft;
  };

  // Suggestion A: More “premium” — slightly bigger headline + accent block
  const s1 = toggleAccent(tweakHeadline(structuredClone(d), +0.12), true);

  // Suggestion B: More “product-forward” — nudge packshot + reduce headline
  const s2 = tweakHeadline(nudgePackshot(structuredClone(d), +20, -10, -2), -0.08);

  // Suggestion C: Layout alt — swap layout if you have these IDs
  // If you only have "packshot_left", keep it; else rotate between common ones.
  const currentLayout = d.layoutId || "packshot_left";
  const nextLayout =
    currentLayout === "packshot_left" ? "packshot_right" :
    currentLayout === "packshot_right" ? "packshot_top" :
    "packshot_left";

  const s3 = switchLayout(toggleAccent(tweakHeadline(structuredClone(d), 0), false), nextLayout);

  return [
    { id: "sugg_premium", label: "Premium emphasis", draft: s1 },
    { id: "sugg_product", label: "Product-forward", draft: s2 },
    { id: "sugg_layout", label: "Layout alternative", draft: s3 },
  ];
}
