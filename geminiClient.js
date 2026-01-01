// geminiClient.js (CommonJS backend client)
require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 1) Read env vars
const apiKey = (process.env.GEMINI_API_KEY || "").trim();
const modelName = (process.env.GEMINI_MODEL || "").trim();

// 2) Validate env vars (clean, judge-friendly errors)
if (!apiKey) {
  throw new Error(
    "❌ GEMINI_API_KEY is missing.\n" +
      "Create a .env file in the project root and add:\n" +
      "GEMINI_API_KEY=YOUR_KEY_HERE\n" +
      "Tip: copy .env.example -> .env"
  );
}

if (!modelName) {
  throw new Error(
    "❌ GEMINI_MODEL is missing.\n" +
      "Add this to your .env file (example):\n" +
      "GEMINI_MODEL=gemini-3-pro-preview\n" +
      "Use the exact model ID from Google AI Studio."
  );
}

// 3) Log safe info only (never log the API key)
console.log("🔧 Using Gemini model:", modelName);

// 4) Init client + model (same logic as you had)
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: modelName });

module.exports = { model };
