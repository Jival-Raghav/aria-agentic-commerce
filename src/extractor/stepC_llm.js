/**
 * Step C — Crawl + LLM Extraction & Vision Nuclear Fallback
 * Layer E in the Universal Extractor Cascade
 * 
 * Supports:
 * - Option 1: Google Gemini API (gemini-2.5-flash / gemini-1.5-flash) for clean DOM text
 * - Option 2: Gemini Multimodal Vision API (screenshot-based extraction for unusual/canvas layouts)
 * - Heuristic DOM & URL Extractor
 */

const https = require('https');
const { createProductRecord, AvailabilityEnum, ProvenanceSourceEnum } = require('../catalog/schema');

/**
 * Pre-processes DOM to remove noise and extract high-signal product text
 */
function cleanDomForLlm(html) {
    if (!html) return '';
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/data:image\/[a-zA-Z]+;base64,[^"'\s]+/g, '')
        .replace(/\s{2,}/g, ' ')
        .slice(0, 15000);
}

/**
 * Heuristic DOM & URL Extractor (used when no external LLM API key is provided)
 */
function heuristicDomExtractor(cleanedDom, productUrl, merchant) {
    let title = '';

    // 1. Try H1 or title tag in DOM
    const titleMatch = cleanedDom.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || cleanedDom.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch && titleMatch[1].trim().length > 3) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').replace(/Online at .*|Buy .* Online/i, '').trim();
    }

    // 2. Fallback: Parse slug from product URL
    if (!title && productUrl) {
        try {
            const urlPath = new URL(productUrl).pathname;
            const segments = urlPath.split('/').filter(Boolean);
            const slug = segments.find(s => s.length > 5 && !s.startsWith('p-') && !s.startsWith('c-') && !/^\d+$/.test(s));
            if (slug) {
                title = slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
            }
        } catch (e) {}
    }

    // Price extraction
    let price = null;
    const pricePatterns = [
        /class="[^"]*(?:price|pdp-price|offer-price|a-price-whole)[^"]*"[^>]*>(?:₹|Rs\.?)?\s*([0-9,]+)/i,
        /(?:₹|Rs\.?|INR)\s*([0-9]{2,}(?:,[0-9]{2,})*(?:\.[0-9]{2})?)/i,
        /"price":\s*"?([0-9.]+)"?/i,
        /itemprop="price"[^>]*content="([0-9.]+)"/i
    ];
    for (const p of pricePatterns) {
        const m = cleanedDom.match(p);
        if (m && m[1]) {
            const val = parseFloat(m[1].replace(/,/g, ''));
            if (!isNaN(val) && val >= 10 && val < 500000) {
                price = val;
                break;
            }
        }
    }

    // Availability
    let avail = AvailabilityEnum.IN_STOCK;
    if (/out of stock|sold out|currently unavailable/i.test(cleanedDom)) {
        avail = AvailabilityEnum.OUT_OF_STOCK;
    }

    // Title Denylist & Validation
    if (title) {
        const lowerTitle = title.toLowerCase();
        const DENYLIST = [
            '404', 'not found', 'page not found', 'we can\'t find', 'access denied',
            'robot check', 'security check', 'just a moment', 'attention required',
            'shop now', 'online store', 'home page', 'products', 'category', 'collection'
        ];
        if (DENYLIST.some(term => lowerTitle.includes(term)) || title.trim().length < 4) {
            return null; // Denylisted non-product title
        }
    }

    if (title && price) {
        return createProductRecord({
            id: `${merchant}_heuristic_${Date.now()}`,
            name: title,
            description: `Heuristically extracted from ${merchant} catalog`,
            price: price,
            currency: 'INR',
            availability: avail,
            product_url: productUrl,
            merchant: merchant,
            source: ProvenanceSourceEnum.LLM_EXTRACTED,
            confidence: 0.70
        });
    }

    return null;
}

/**
 * Call Gemini API with DOM Text (Option 1)
 */
async function callGeminiLlm(cleanedDom, apiKey) {
    const prompt = `You are a strict e-commerce product extraction parser.
Given the following raw HTML snippet from an e-commerce product page, extract the product information into JSON format.

Strict schema:
{
  "name": string (exact product title),
  "description": string (short summary),
  "price": number (numeric value only in INR, e.g. 799),
  "currency": "INR",
  "availability": "in_stock" | "out_of_stock" | "unknown",
  "variants": string[]
}

Rules:
- Output ONLY a valid JSON object matching the schema. Do NOT include markdown code blocks or explanations.
- If price cannot be identified, use null.
- Do NOT guess or hallucinate any fields.

HTML Content:
${cleanedDom}`;

    const payload = JSON.stringify({
        contents: [{
            parts: [{ text: prompt }]
        }],
        generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json"
        }
    });

    return new Promise((resolve, reject) => {
        const req = https.request(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) {
                        const productJson = JSON.parse(text);
                        resolve(productJson);
                    } else {
                        reject(new Error(`Gemini response missing content: ${data.slice(0, 200)}`));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

/**
 * Call Gemini Multimodal Vision API on rendered page screenshot (Layer E Nuclear Fallback)
 */
async function callGeminiVision(base64Screenshot, apiKey) {
    const prompt = `You are a strict e-commerce vision parser.
Analyze this screenshot of an e-commerce product page and extract the core product details.

Strict schema:
{
  "name": string (exact product title visible),
  "description": string (short summary),
  "price": number (numeric value only, e.g. 1499),
  "currency": "INR",
  "availability": "in_stock" | "out_of_stock" | "unknown",
  "variants": string[]
}

Rules:
- Output ONLY a valid JSON object matching the schema.
- If the price is shown as ₹1,299 or Rs 1299, extract 1299.
- If not a product page or price cannot be visually found, return { "name": null, "price": null }`;

    const payload = JSON.stringify({
        contents: [{
            parts: [
                { text: prompt },
                {
                    inlineData: {
                        mimeType: "image/png",
                        data: base64Screenshot
                    }
                }
            ]
        }],
        generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json"
        }
    });

    return new Promise((resolve, reject) => {
        const req = https.request(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) {
                        const productJson = JSON.parse(text);
                        resolve(productJson);
                    } else {
                        reject(new Error(`Gemini Vision response missing text: ${data.slice(0, 200)}`));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

/**
 * Main Step C extraction router
 */
async function extractWithLlm({ domHtml, productUrl, merchant, pageClient, apiKey = process.env.GEMINI_API_KEY }) {
    const cleaned = cleanDomForLlm(domHtml);

    // 1. Try Gemini Text API
    if (apiKey) {
        try {
            const llmResult = await callGeminiLlm(cleaned, apiKey);
            if (llmResult && llmResult.name && llmResult.price) {
                const product = createProductRecord({
                    id: `${merchant}_llm_${Date.now()}`,
                    name: llmResult.name,
                    description: llmResult.description || '',
                    price: Number(llmResult.price),
                    currency: llmResult.currency || 'INR',
                    availability: llmResult.availability === 'in_stock' ? AvailabilityEnum.IN_STOCK : (llmResult.availability === 'out_of_stock' ? AvailabilityEnum.OUT_OF_STOCK : AvailabilityEnum.UNKNOWN),
                    variants: Array.isArray(llmResult.variants) ? llmResult.variants : [],
                    product_url: productUrl,
                    merchant: merchant,
                    source: ProvenanceSourceEnum.LLM_EXTRACTED,
                    confidence: 0.85
                });
                return { success: true, method: 'gemini_llm_text', product };
            }
        } catch (e) {
            console.warn(`[Step C] Gemini text API failed: ${e.message}`);
        }
    }

    // 2. Try Gemini Vision Screenshot Nuclear Fallback (if pageClient and apiKey provided)
    if (apiKey && pageClient) {
        try {
            console.log(`[Step C] Attempting Gemini Vision screenshot nuclear fallback...`);
            const screenshotRes = await pageClient.send('Page.captureScreenshot', { format: 'png' });
            if (screenshotRes && screenshotRes.data) {
                const visionResult = await callGeminiVision(screenshotRes.data, apiKey);
                if (visionResult && visionResult.name && visionResult.price) {
                    const product = createProductRecord({
                        id: `${merchant}_vision_${Date.now()}`,
                        name: visionResult.name,
                        description: visionResult.description || `Extracted via Gemini Vision`,
                        price: Number(visionResult.price),
                        currency: visionResult.currency || 'INR',
                        availability: visionResult.availability === 'out_of_stock' ? AvailabilityEnum.OUT_OF_STOCK : AvailabilityEnum.IN_STOCK,
                        variants: Array.isArray(visionResult.variants) ? visionResult.variants : [],
                        product_url: productUrl,
                        merchant: merchant,
                        source: ProvenanceSourceEnum.LLM_EXTRACTED,
                        confidence: 0.88
                    });
                    return { success: true, method: 'gemini_llm_vision', product };
                }
            }
        } catch (vErr) {
            console.warn(`[Step C] Gemini Vision fallback error: ${vErr.message}`);
        }
    }

    // 3. Heuristic DOM/URL extraction fallback
    const heuristicProduct = heuristicDomExtractor(cleaned, productUrl, merchant);
    if (heuristicProduct) {
        return { success: true, method: 'heuristic_dom', product: heuristicProduct };
    }

    return { success: false, error: 'Could not extract product data from rendered DOM' };
}

module.exports = {
    cleanDomForLlm,
    extractWithLlm,
    callGeminiVision,
    heuristicDomExtractor
};
