/**
 * Price Reasonableness Validator
 * 
 * Validates that an extracted price makes statistical and contextual sense:
 * 1. Absolute floor check (no product in Indian e-commerce is < ₹5)
 * 2. Dynamic 10% Budget Floor (if user said "under ₹500", minimum floor is ₹50 — prevents accessory trap)
 * 3. Extraction confidence check (low confidence + suspiciously low price = extraction error)
 * 4. Category-specific expected price ranges (17 product categories)
 * 5. Subscription / recurring payment detection
 * 
 * No LLMs needed for price bounds — pure deterministic validation.
 */

// Category keyword patterns → [minINR, maxINR]
// Conservative ranges for Indian market pricing
const CATEGORY_PRICE_RANGES = [
    { pattern: /headphone|earphone|earplug|earbud|tws|airpod|neckband/i, min: 99, max: 100000, name: 'Audio Devices' },
    { pattern: /shirt|tshirt|t-shirt|polo|tee|top|blouse|kurta|kurti/i, min: 49, max: 10000, name: 'Tops & Shirts' },
    { pattern: /watch|smartwatch|timepiece|fitbit|garmin/i, min: 99, max: 700000, name: 'Watches' },
    { pattern: /laptop|macbook|notebook|chromebook|ultrabook/i, min: 5000, max: 500000, name: 'Laptops' },
    { pattern: /phone|smartphone|iphone|samsung|oneplus|pixel|motorola|realme|redmi|poco/i, min: 1000, max: 250000, name: 'Smartphones' },
    { pattern: /lipstick|mascara|foundation|concealer|blush|highlighter|eyeshadow|kajal|eyeliner/i, min: 29, max: 8000, name: 'Cosmetics' },
    { pattern: /moisturizer|serum|sunscreen|cream|lotion|face wash|toner|cleanser/i, min: 49, max: 10000, name: 'Skincare' },
    { pattern: /shoes|sneakers|footwear|sandal|slipper|boots|chappal|heels/i, min: 99, max: 50000, name: 'Footwear' },
    { pattern: /bag|backpack|handbag|purse|wallet|clutch|tote/i, min: 99, max: 300000, name: 'Bags & Wallets' },
    { pattern: /saree|sari|lehenga|salwar|anarkali|dupatta/i, min: 149, max: 500000, name: 'Indian Ethnic Wear' },
    { pattern: /jeans|trouser|pant|chino|shorts|jogger/i, min: 99, max: 15000, name: 'Bottoms' },
    { pattern: /tablet|ipad|kindle|e-reader/i, min: 2000, max: 200000, name: 'Tablets' },
    { pattern: /speaker|soundbar|bluetooth speaker/i, min: 199, max: 200000, name: 'Speakers' },
    { pattern: /charger|cable|power bank|adapter|hub/i, min: 49, max: 20000, name: 'Accessories' },
    { pattern: /perfume|deodorant|body spray|cologne|eau de parfum/i, min: 79, max: 30000, name: 'Fragrances' },
    { pattern: /protein|supplement|vitamin|whey|creatine|nutrition/i, min: 199, max: 20000, name: 'Supplements' },
    { pattern: /book|novel|textbook|guide/i, min: 49, max: 15000, name: 'Books' },
];

// Absolute floor for ANY product on Indian e-commerce
const ABSOLUTE_MIN_PRICE = 5; // ₹5

// Suspicious price floor multiplier: if price is below (category_min * this), flag it
const SUSPICIOUS_FLOOR_MULTIPLIER = 0.1; // 90% below category floor

// Overpriced ceiling multiplier
const OVERPRICED_CEILING_MULTIPLIER = 10; // 10x above category ceiling

// Dynamic Floor percentage of user's stated target budget (10%)
const DYNAMIC_BUDGET_FLOOR_PERCENTAGE = 0.10;

/**
 * Extracts numeric budget from user goal prompt
 * Examples:
 * - "buy a shirt under 500 rupees" -> 500
 * - "find headphones below ₹25,000" -> 25000
 * - "budget 1500 for sneakers" -> 1500
 * - "upto Rs 2000" -> 2000
 */
function extractBudgetFromGoal(userGoal) {
    if (!userGoal || typeof userGoal !== 'string') return null;

    const patterns = [
        /(?:under|below|less than|within|max|budget|upto|up to)\s*(?:rs\.?|inr|₹)?\s*([0-9,]+)/i,
        /(?:rs\.?|inr|₹)\s*([0-9,]+)\s*(?:max|budget|or less|under|below)/i,
        /([0-9,]+)\s*(?:rs\.?|inr|₹|rupees)\s*(?:max|budget|limit)/i
    ];

    for (const pat of patterns) {
        const match = userGoal.match(pat);
        if (match && match[1]) {
            const num = Number(match[1].replace(/,/g, ''));
            if (!isNaN(num) && num > 0) {
                return num;
            }
        }
    }

    return null;
}

/**
 * Detects subscription-related products from name/description
 * Recurring payments are blocked as they require ongoing human consent
 */
function detectSubscriptionSignal(product) {
    const name = (product.name || '').toLowerCase();
    const desc = (product.description || '').toLowerCase();
    const combined = name + ' ' + desc;

    const subscriptionKeywords = [
        'subscription', 'monthly plan', 'annual plan', 'yearly plan',
        'recurring', 'auto-renew', 'membership', 'prime membership',
        'netflix', 'spotify', 'adobe creative', 'office 365', 'microsoft 365',
        '/month', '/year', 'per month', 'per year', 'billed monthly', 'billed annually'
    ];

    for (const kw of subscriptionKeywords) {
        if (combined.includes(kw)) {
            return { detected: true, keyword: kw };
        }
    }

    return { detected: false };
}

/**
 * Validates price reasonableness for a product
 * @param {Object} product - Product record
 * @param {string|null} userGoal - Optional user goal prompt to apply dynamic 10% budget floor
 * @returns {Object} { valid: boolean, rule: string, reason: string, category: string|null, dynamicBudgetFloor?: number }
 */
function validatePriceReasonableness(product, userGoal = null) {
    const price = Number(product.price);
    const name = product.name || '';
    const confidence = product.confidence || 1.0;

    // 1. Absolute floor check — catches ₹0, ₹1, ₹3 extraction errors
    if (price < ABSOLUTE_MIN_PRICE) {
        return {
            valid: false,
            rule: 'EXTRACTION_ERROR_ZERO_PRICE',
            reason: `Extracted price ₹${price} is below the absolute floor of ₹${ABSOLUTE_MIN_PRICE}. This is almost certainly an extraction error.`,
            category: null
        };
    }

    // 2. Dynamic 10% Budget Floor Check (Contextual Protection against Accessory Trap)
    const targetBudget = extractBudgetFromGoal(userGoal);
    if (targetBudget && targetBudget > 0) {
        const dynamicMinFloor = Math.max(ABSOLUTE_MIN_PRICE, Math.round(targetBudget * DYNAMIC_BUDGET_FLOOR_PERCENTAGE));
        if (price < dynamicMinFloor) {
            return {
                valid: false,
                rule: 'SUSPICIOUS_BUDGET_FLOOR',
                reason: `Price ₹${price} is below 10% of stated budget of ₹${targetBudget} (dynamic floor: ₹${dynamicMinFloor}). Flagged as possible accessory, sticker, or extraction anomaly.`,
                category: null,
                dynamicBudgetFloor: dynamicMinFloor,
                statedBudget: targetBudget
            };
        }
    }

    // 3. Low confidence + suspiciously low price = extraction error
    if (confidence < 0.6 && price < 20) {
        return {
            valid: false,
            rule: 'EXTRACTION_ERROR_LOW_CONFIDENCE',
            reason: `Price ₹${price} combined with confidence ${(confidence * 100).toFixed(0)}% signals a likely data extraction error. Manual review recommended.`,
            category: null
        };
    }

    // 4. Category range check
    for (const cat of CATEGORY_PRICE_RANGES) {
        if (cat.pattern.test(name)) {
            const suspiciousFloor = cat.min * SUSPICIOUS_FLOOR_MULTIPLIER;
            const overpricedCeiling = cat.max * OVERPRICED_CEILING_MULTIPLIER;

            if (price < suspiciousFloor) {
                return {
                    valid: false,
                    rule: 'SUSPICIOUS_PRICE',
                    reason: `Price ₹${price} is implausibly low for a "${cat.name}" product (expected minimum: ₹${cat.min}). Flagged as likely extraction error or fraudulent listing.`,
                    category: cat.name,
                    expectedRange: `₹${cat.min} – ₹${cat.max}`
                };
            }

            if (price > overpricedCeiling) {
                return {
                    valid: false,
                    rule: 'OVERPRICED_ANOMALY',
                    reason: `Price ₹${price} is anomalously high for a "${cat.name}" product (expected maximum: ₹${cat.max}). Possible wrong currency units or extraction error.`,
                    category: cat.name,
                    expectedRange: `₹${cat.min} – ₹${cat.max}`
                };
            }

            // Within range
            return {
                valid: true,
                rule: 'PRICE_REASONABLE',
                reason: `Price ₹${price} is within expected range for "${cat.name}" (₹${cat.min} – ₹${cat.max})${targetBudget ? ` and meets dynamic budget floor (₹${Math.round(targetBudget * DYNAMIC_BUDGET_FLOOR_PERCENTAGE)})` : ''}.`,
                category: cat.name,
                expectedRange: `₹${cat.min} – ₹${cat.max}`
            };
        }
    }

    // 5. Uncategorized — pass through
    return {
        valid: true,
        rule: 'PRICE_UNCATEGORIZED',
        reason: `Product "${name}" category not recognized. Price ₹${price} passed${targetBudget ? ` and satisfies dynamic budget floor (₹${Math.round(targetBudget * DYNAMIC_BUDGET_FLOOR_PERCENTAGE)})` : ''}.`,
        category: null
    };
}

module.exports = {
    validatePriceReasonableness,
    detectSubscriptionSignal,
    extractBudgetFromGoal,
    CATEGORY_PRICE_RANGES
};
