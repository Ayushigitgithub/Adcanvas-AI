# AdCanvas-AI 🎨⚡
AI-powered ad creative builder with **template-based layout**, **variant resizing**, **compliance checks**, and **one-click PNG/JPEG export**.

This project helps users quickly generate ad creatives in multiple platform sizes (Instagram/Facebook etc.) while keeping layouts consistent and running basic compliance checks (safe area, cut-off risk, etc.).

---

## ✨ What this app does (3-step flow)
1) **Setup Page**
   - Choose platform / campaign objective / tone
   - Select a template + visual preferences

2) **Builder Page**
   - Edit Headline / Subcopy / CTA
   - Place + resize logo / packshot / background
   - Live preview while editing

3) **Review Page**
   - Auto-generates multiple **size variants** (e.g., FB Feed/Story/Square/Cover)
   - Runs **compliance audit** (safe text area, truncation risk)
   - Export creatives as **PNG** or **JPEG (< 500KB)**

---

## 🧱 Tech Stack
- **Frontend:** React (Create React App)
- **Canvas:** Konva / react-konva
- **Backend:** Node + Express (Gemini copy generation)

---

## ✅ What is included in this repo (and what is NOT)
✅ Included:
- `src/` (frontend code)
- `public/`
- `server.js`, `geminiClient.js` (backend)
- `package.json`, `package-lock.json`
- `.gitignore`
- `.env.example` (safe sample)

❌ NOT included (on purpose):
- `.env` (contains secret API key)
- `node_modules/` (huge; auto-created after install)
- `build/` (auto-created by `npm run build`)

---

## ✅ Requirements
- **Node.js 18+** recommended
- **npm** (comes with Node)

---

## 🔐 Environment Variables (IMPORTANT)
This project uses a **Gemini API key** in the backend.

### 1) Create `.env` from example
In the **project root** (same folder as `server.js`), create `.env` from `.env.example`:

#### Windows PowerShell
```bash
copy .env.example .env

##### Demo Video (2–4 min)
Loom Link ( https://www.loom.com/share/68fe0a55fd5c4341a5ef14e68d455a07 ) 
You can copy the above link in browser.
