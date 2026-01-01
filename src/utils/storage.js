// src/utils/storage.js
export const LS_KEYS = {
  DRAFT: "adcanvas:draft:v1",
  PALETTES: "adcanvas:palettes:v1",
};

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}
