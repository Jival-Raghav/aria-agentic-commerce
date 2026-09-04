/**
 * Configuration & Environment Loader
 */

const fs = require('fs');
const path = require('path');

function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        const lines = fs.readFileSync(envPath, 'utf8').split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const idx = trimmed.indexOf('=');
                if (idx > 0) {
                    const key = trimmed.substring(0, idx).trim();
                    const val = trimmed.substring(idx + 1).trim();
                    if (!process.env[key]) {
                        process.env[key] = val;
                    }
                }
            }
        }
    }
}

loadEnv();

module.exports = {
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || '',
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || '',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    SERPAPI_KEY: process.env.SERPAPI_KEY || process.env.SERPAPI_API_KEY || '',
    GOOGLE_SEARCH_API_KEY: process.env.GOOGLE_SEARCH_API_KEY || '',
    GOOGLE_SEARCH_CX: process.env.GOOGLE_SEARCH_CX || process.env.GOOGLE_CX || '',
    BRAVE_SEARCH_API_KEY: process.env.BRAVE_SEARCH_API_KEY || '',
    TAVILY_API_KEY: process.env.TAVILY_API_KEY || '',
    GROQ_API_KEY: process.env.GROQ_API_KEY || '',
    PORT: process.env.PORT || 3000
};
