/**
 * Groq-Powered Semantic Intent Parser & E-Commerce Goal Normalizer
 * Uses fast LPU inference (qwen/qwen3.8-27b on Groq) to dissolve compound noun ambiguity
 * (e.g. "shoe cleaner" vs "shoes", "laptop bag" vs "laptop", "guitar strings" vs "guitar").
 * 
 * Includes instant deterministic fallback if Groq API is unreachable.
 */

const https = require('https');
const config = require('../config');

/**
 * Fallback: Pure deterministic parser if LLM is offline
 */
function deterministicParse(goal) {
    let maxPrice = Infinity;
    let minPrice = 0;
    let merchant = null;

    const priceMatch = goal.match(/\b(?:under|below|less than|max|budget)\b\s*(?:₹|Rs\.?|INR)?\s*([0-9,]+)/i);
    if (priceMatch) {
        maxPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
    }
    if (maxPrice !== Infinity && maxPrice >= 500) {
        minPrice = Math.round(maxPrice * 0.20);
    }

    const merchantMatch = goal.match(/\b(?:from|on|at|via)\b\s*([a-zA-Z0-9_\-\.]+)\b/i);
    if (merchantMatch) {
        const mCandidate = merchantMatch[1].toLowerCase().replace(/\.in|\.com/gi, '');
        const nonMerchants = ['online', 'india', 'today', 'cheap', 'best', 'sale', 'store', 'market', 'stock'];
        if (!nonMerchants.includes(mCandidate)) {
            merchant = mCandidate;
        }
    }

    const cleanTerms = goal
        .replace(/\b(?:find|buy|get|show|search|for|me|a|an|the|in\s+stock|available|rupees|rs|paisa|costing|price)\b/gi, ' ')
        .replace(/\b(?:under|below|less than|max|budget)\b\s*(?:₹|Rs\.?|INR)?\s*[0-9,]+/gi, ' ')
        .replace(/\b(?:from|on|at|via)\b\s*[a-zA-Z0-9_\-\.]+\b/gi, ' ')
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');

    let category = 'general';
    let isAccessory = false;
    const lowerGoal = goal.toLowerCase();

    if (/cleaner|polish|brush|care|foam|spray|crease/i.test(lowerGoal) && /shoe|sneaker/i.test(lowerGoal)) {
        category = 'shoe_care';
        isAccessory = true;
    } else if (/string|pick|strap|capo|stand|tuner/i.test(lowerGoal) && /guitar/i.test(lowerGoal)) {
        category = 'musical_accessories';
        isAccessory = true;
    } else if (/bag|sleeve|case|skin|charger|stand|cover/i.test(lowerGoal) && /laptop|macbook/i.test(lowerGoal)) {
        category = 'laptop_accessories';
        isAccessory = true;
    } else if (/case|cover|protector|holder|stand|cable/i.test(lowerGoal) && /phone|mobile/i.test(lowerGoal)) {
        category = 'phone_accessories';
        isAccessory = true;
    } else if (/headphone|earphone|earbud|airpod|headset|tws|airdope|audio/i.test(lowerGoal)) {
        category = 'audio';
    } else if (/\b(?:smart)?phone[s]?\b|\bmobile[s]?\b/i.test(lowerGoal)) {
        category = 'phone';
    } else if (/laptop|notebook|chromebook|macbook/i.test(lowerGoal)) {
        category = 'laptop';
    } else if (/speaker|soundbar/i.test(lowerGoal)) {
        category = 'speaker';
    } else if (/guitar|ukulele|piano|keyboard|violin|drum/i.test(lowerGoal)) {
        category = 'guitar';
    } else if (/bat\b|cricket/i.test(lowerGoal)) {
        category = 'bat';
    } else if (/shoe|sneaker|footwear|slipper|sandal/i.test(lowerGoal)) {
        category = 'shoes';
    } else if (/watch|smartwatch/i.test(lowerGoal)) {
        category = 'watch';
    } else if (/shirt|tshirt|tee|polo|top/i.test(lowerGoal)) {
        category = 'shirt';
    }

    let brand = null;
    if (cleanTerms) {
        const genericModifiers = new Set(['anc', 'wireless', 'bluetooth', 'wired', 'gaming', 'acoustic', 'electric', 'electro', 'smart', 'running', 'casual', 'formal', 'sports', 'over-ear', 'in-ear', 'tws', 'pro', 'lite', 'plus', 'max', 'mini', 'fast', '5g', '4g', 'portable', 'cotton', 'oversized', 'noise', 'cancelling', 'cancellation', 'active', 'true', 'bass', 'stereo', 'cleaner', 'kit']);
        const categoryWords = new Set(['laptop', 'notebook', 'chromebook', 'macbook', 'phone', 'smartphone', 'mobile', 'headphone', 'headphones', 'earphone', 'earphones', 'earbud', 'earbuds', 'headset', 'audio', 'guitar', 'guitars', 'bat', 'bats', 'shoe', 'shoes', 'sneaker', 'sneakers', 'watch', 'watches', 'shirt', 'shirts', 'tshirt', 'speaker', 'speakers']);

        const termWords = cleanTerms.toLowerCase().split(/\s+/);
        const brandTokens = [];
        for (const w of termWords) {
            if (categoryWords.has(w)) break;
            if (!genericModifiers.has(w)) {
                brandTokens.push(w);
            }
        }
        if (brandTokens.length > 0) {
            brand = brandTokens.join(' ');
            if (brand === 'newbalance') brand = 'new balance';
        }
    }

    return {
        rawGoal: goal,
        searchQuery: cleanTerms.length > 0 ? cleanTerms : goal,
        targetProduct: cleanTerms || goal,
        category,
        isAccessory,
        maxPrice,
        minPrice,
        merchant,
        brand,
        inStockOnly: true,
        parserUsed: 'deterministic_fallback'
    };
}

/**
 * Parses user goal via Groq LPU API (qwen/qwen3.8-27b)
 */
async function parseGoalWithGroq(goal) {
    const groqKey = process.env.GROQ_API_KEY || config.GROQ_API_KEY;
    if (!groqKey) {
        return null;
    }

    const systemPrompt = `You are a high-precision e-commerce intent parser. Analyze the user's natural language shopping request and return a JSON object with:
- searchQuery: The most effective search query for search engines. Keep core product, key modifiers, and budget ceiling if specified (e.g. "running shoes under 3500", "acoustic guitar under 7000") so search engines return budget-appropriate store listings.
- targetProduct: The exact physical item being purchased (e.g. "shoe cleaner", "earphones", "running shoes", "laptop stand", "acoustic guitar", "guitar strings").
- category: Standard product category. Options: "shoe_care", "shoes", "audio", "phone", "phone_accessories", "laptop", "laptop_accessories", "guitar", "musical_accessories", "apparel", "watches", "general".
- isAccessory: Boolean. True if the user wants an accessory, cleaning supply, tool, or spare part (e.g. shoe cleaner, guitar strings, laptop sleeve, phone case). False if the user wants the primary item/device (e.g. shoes, guitar, laptop, phone, earphones).
- brand: Brand name if mentioned (e.g. "Sony", "Yamaha", "boAt", "Nike", "Sneakare", "Nothing"), otherwise null.
- merchant: Specific store or platform requested (e.g. "Amazon", "Flipkart", "Bajaao", "Snitch"), otherwise null.
- maxPrice: Number in INR if the user stated a budget or ceiling (e.g. 5000), otherwise null.
- minPrice: Number in INR (recommended floor = 20% of maxPrice to reject junk, or 0 if no maxPrice).`;

    const payload = JSON.stringify({
        model: 'qwen/qwen3.8-27b',
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 350,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: goal }
        ]
    });

    return new Promise((resolve) => {
        const req = https.request('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            timeout: 3500,
            headers: {
                'Authorization': `Bearer ${groqKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    const content = parsed.choices?.[0]?.message?.content;
                    if (content) {
                        const json = JSON.parse(content);
                        const maxP = (json.maxPrice !== null && json.maxPrice !== undefined && !isNaN(Number(json.maxPrice)))
                            ? Number(json.maxPrice)
                            : Infinity;
                        const minP = (json.minPrice !== null && json.minPrice !== undefined && !isNaN(Number(json.minPrice)))
                            ? Number(json.minPrice)
                            : (maxP !== Infinity && maxP >= 500 ? Math.round(maxP * 0.20) : 0);

                        resolve({
                            rawGoal: goal,
                            searchQuery: json.searchQuery || goal,
                            targetProduct: json.targetProduct || goal,
                            category: json.category || 'general',
                            isAccessory: json.isAccessory === true,
                            maxPrice: maxP,
                            minPrice: minP,
                            merchant: json.merchant ? json.merchant.toLowerCase() : null,
                            brand: json.brand ? json.brand.toLowerCase() : null,
                            inStockOnly: true,
                            parserUsed: 'groq_lpu (qwen/qwen3.8-27b)'
                        });
                        return;
                    }
                } catch (e) {}
                resolve(null);
            });
        });

        req.on('error', () => resolve(null));
        req.on('timeout', () => {
            req.destroy();
            resolve(null);
        });

        req.write(payload);
        req.end();
    });
}

/**
 * Universal Semantic Intent Parser
 * Tries Groq LPU first (< 300ms), falls back to deterministic rule parser
 */
async function parseGoal(goal) {
    try {
        const groqResult = await parseGoalWithGroq(goal);
        if (groqResult) {
            console.log(`[Intent Parser] Groq LPU parsed goal: "${goal}" -> category: ${groqResult.category}, isAccessory: ${groqResult.isAccessory}, product: "${groqResult.targetProduct}"`);
            return groqResult;
        }
    } catch (e) {
        console.warn(`[Intent Parser] Groq error (${e.message}), falling back to deterministic parser.`);
    }

    return deterministicParse(goal);
}

module.exports = {
    parseGoal,
    parseGoalWithGroq,
    deterministicParse
};
