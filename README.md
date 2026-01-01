# AdCanvas-AI 🎨⚡
AI-powered ad creative builder with **template-based layout**, **variant resizing**, **compliance checks**, and **one-click PNG/JPEG export**.

This project helps users quickly generate ad creatives in multiple platform sizes (e.g., Instagram, Facebook) while keeping layouts consistent and checking basic creative compliance rules.

---

## ✨ What this app does
### ✅ Core flow
1. **Setup Page**
   - Select campaign/platform + creative intent
   - Choose template + visual style preferences

2. **Builder Page**
   - Edit headline/body/CTA
   - Place and resize images + text inside the template
   - Live preview while editing

3. **Review Page**
   - Auto-generates multiple **size variants**
   - Runs a **compliance audit** (safe text area, cut-off risk, etc.)
   - Export creatives as **PNG/JPEG**

---

## 🧱 Tech Stack
- **Frontend:** React (Create React App)
- **Canvas Engine:** react-konva / Konva
- **Backend:** Node (server.js) for Gemini / copy suggestions (if enabled)

---

## ✅ Requirements
- **Node.js** (recommended: Node 18+)
- **npm** (comes with Node)

---

## 🚀 How to Run Locally (Frontend)
```bash
npm install
npm start
