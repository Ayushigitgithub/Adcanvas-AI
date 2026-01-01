// src/templates.js
export const STYLE_PRESETS = {
  "Bold & modern": {
    headlineFont: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    headlineWeight: 800,
    headlineLetterSpacing: -0.5,
    bodyFont: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    bodyWeight: 500,
    radius: 18,
    shadow: true,
    accentBlock: true,
  },
  Minimal: {
    headlineFont: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    headlineWeight: 700,
    headlineLetterSpacing: -0.2,
    bodyFont: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    bodyWeight: 400,
    radius: 12,
    shadow: false,
    accentBlock: false,
  },
  Playful: {
    headlineFont: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    headlineWeight: 900,
    headlineLetterSpacing: 0.2,
    bodyFont: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    bodyWeight: 500,
    radius: 26,
    shadow: true,
    accentBlock: true,
  },
};

export const TEMPLATES = [
  {
    id: "tesco_no_cta",
    name: "Retail banner – NO CTA",
    hasCTA: false,
    description:
      "Onsite / retail media banner where only brand + price info is allowed. No CTA button.",
  },
  {
    id: "tesco_neutral_cta",
    name: "Hero banner – neutral CTA",
    hasCTA: true,
    description:
      "Hero creative where CTA must be neutral, e.g. “Learn more” / “Know more”, not hard-sell.",
  },
  {
    id: "social_standard_cta",
    name: "Social ad – standard CTA",
    hasCTA: true,
    description:
      "Facebook / Instagram ad where standard CTAs like “Shop now” or “Add to cart” are allowed.",
  },
];
