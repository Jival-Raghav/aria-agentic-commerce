/**
 * Step B2 — Embedded JSON State Extractor
 * Layer C in the Universal Extractor Cascade
 * 
 * Inspects raw HTML for server-hydrated JSON state blobs:
 * - Next.js: <script id="__NEXT_DATA__" type="application/json">
 * - Nuxt / Vue: window.__NUXT__
 * - Redux / React: window.__INITIAL_STATE__, window.__PRELOADED_STATE__, window.__STATE__
 * - Shopify: <script data-product-json type="application/json">, window.ShopifyAnalytics.meta.product
 * - Remix: window.__remixContext
 * - Generic: <script type="application/json"> containing product-like schemas
 */

const { createProductRecord, AvailabilityEnum, ProvenanceSourceEnum } = require('../catalog/schema');

/**
 * Recursively search a JavaScript object for a product-like dictionary
 */
function findProductInState(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 8) return null;

    // Check if current node is product-like
    const keys = Object.keys(obj).map(k => k.toLowerCase());
    const hasName = keys.some(k => k === 'name' || k === 'title' || k === 'productname' || k === 'product_name');
    const hasPrice = keys.some(k => k === 'price' || k === 'sellingprice' || k === 'offerprice' || k === 'mrp' || k === 'price_inr' || k === 'amount');

    if (hasName && hasPrice) {
        // Extract candidate values
        const nameVal = obj.name || obj.title || obj.productName || obj.product_name;
        let priceVal = obj.price || obj.sellingPrice || obj.offerPrice || obj.selling_price || obj.mrp || obj.amount;

        // If price is nested object (e.g. { raw: 1499, formatted: "₹1,499" } or { value: 1499 })
        if (typeof priceVal === 'object' && priceVal !== null) {
            priceVal = priceVal.value || priceVal.raw || priceVal.amount || priceVal.sellingPrice || Object.values(priceVal)[0];
        }

        let numericPrice = typeof priceVal === 'number' ? priceVal : parseFloat(String(priceVal || '').replace(/[^0-9.]/g, ''));

        // Handle Shopify/e-commerce platforms that store prices in cents/paise (e.g., 199900 = ₹1,999)
        if (numericPrice >= 10000 && Number.isInteger(numericPrice) && (obj.handle || obj.variants || obj.price_min || String(priceVal).endsWith('00'))) {
            // Check if dividing by 100 produces a standard retail price
            numericPrice = numericPrice / 100;
        }

        if (typeof nameVal === 'string' && nameVal.trim().length > 2 && !isNaN(numericPrice) && numericPrice > 0 && numericPrice < 1000000) {
            const lowerName = nameVal.toLowerCase().trim();
            const TITLE_DENYLIST = [
                '404', 'not found', 'page not found', 'we can\'t find', 'could not find',
                'access denied', 'robot check', 'security check', 'just a moment',
                'attention required', 'shop now', 'online store', 'home page', 'default title',
                'undefined', 'null', 'unknown product', 'item not available', 'error'
            ];
            if (TITLE_DENYLIST.some(d => lowerName.includes(d))) {
                return null;
            }
            if (/^(products|shop|store|online|buy|home|category|collection)$/i.test(lowerName)) {
                return null;
            }

            // Determine stock
            let avail = AvailabilityEnum.IN_STOCK;
            const stockVal = obj.inStock ?? obj.in_stock ?? obj.available ?? obj.isAvailable ?? obj.stock ?? obj.inventory_quantity;
            if (stockVal === false || stockVal === 0 || stockVal === 'out_of_stock') {
                avail = AvailabilityEnum.OUT_OF_STOCK;
            }

            return {
                name: nameVal.trim(),
                price: numericPrice,
                currency: obj.currency || obj.priceCurrency || 'INR',
                description: obj.description || obj.shortDescription || '',
                availability: avail,
                variants: Array.isArray(obj.variants) ? obj.variants.map(v => typeof v === 'string' ? v : (v.title || v.name)).filter(Boolean) : []
            };
        }
    }

    // Recurse into children
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const found = findProductInState(item, depth + 1);
            if (found) return found;
        }
    } else {
        // Prioritize keys that sound like product containers
        const prioritizedKeys = Object.keys(obj).sort((a, b) => {
            const aScore = /product|item|detail|pdp|catalog/i.test(a) ? -1 : 1;
            const bScore = /product|item|detail|pdp|catalog/i.test(b) ? -1 : 1;
            return aScore - bScore;
        });

        for (const key of prioritizedKeys) {
            const found = findProductInState(obj[key], depth + 1);
            if (found) return found;
        }
    }

    return null;
}

/**
 * Extracts product details from embedded JSON state blobs in raw HTML
 */
function extractFromEmbeddedJsonState(rawHtml, productUrl, merchant) {
    if (!rawHtml || typeof rawHtml !== 'string') {
        return { found: false, products: [], error: 'Empty HTML' };
    }

    const products = [];

    // 1. Next.js __NEXT_DATA__
    const nextDataMatch = rawHtml.match(/<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/i);
    if (nextDataMatch && nextDataMatch[1]) {
        try {
            const parsed = JSON.parse(nextDataMatch[1]);
            const candidate = findProductInState(parsed);
            if (candidate) {
                products.push(createProductRecord({
                    id: `${merchant}_nextdata_${Date.now()}`,
                    name: candidate.name,
                    description: candidate.description,
                    price: candidate.price,
                    currency: candidate.currency,
                    availability: candidate.availability,
                    variants: candidate.variants,
                    product_url: productUrl,
                    merchant: merchant,
                    source: ProvenanceSourceEnum.LLM_EXTRACTED, // or STRUCTURED_STATE
                    confidence: 0.90
                }));
            }
        } catch (e) {}
    }

    // 2. Window / Global state assignments (__INITIAL_STATE__, __PRELOADED_STATE__, __STATE__)
    if (products.length === 0) {
        const statePatterns = [
            /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});(?:\s*<\/script>|\s*\n)/i,
            /window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});(?:\s*<\/script>|\s*\n)/i,
            /window\.__STATE__\s*=\s*(\{[\s\S]*?\});(?:\s*<\/script>|\s*\n)/i,
            /window\.pageData\s*=\s*(\{[\s\S]*?\});(?:\s*<\/script>|\s*\n)/i,
            /window\.ShopifyAnalytics\.meta\.product\s*=\s*(\{[\s\S]*?\});/i
        ];

        for (const pattern of statePatterns) {
            const m = rawHtml.match(pattern);
            if (m && m[1]) {
                try {
                    const parsed = JSON.parse(m[1]);
                    const candidate = findProductInState(parsed);
                    if (candidate) {
                        products.push(createProductRecord({
                            id: `${merchant}_state_${Date.now()}`,
                            name: candidate.name,
                            description: candidate.description,
                            price: candidate.price,
                            currency: candidate.currency,
                            availability: candidate.availability,
                            variants: candidate.variants,
                            product_url: productUrl,
                            merchant: merchant,
                            source: ProvenanceSourceEnum.LLM_EXTRACTED,
                            confidence: 0.90
                        }));
                        break;
                    }
                } catch (e) {}
            }
        }
    }

    // 3. Shopify / Generic product json script tags
    if (products.length === 0) {
        const scriptJsonMatches = rawHtml.matchAll(/<script[^>]+type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi);
        for (const match of scriptJsonMatches) {
            if (match[1] && (match[0].includes('product') || match[0].includes('data-product-json') || match[0].includes('props'))) {
                try {
                    const parsed = JSON.parse(match[1]);
                    const candidate = findProductInState(parsed);
                    if (candidate) {
                        products.push(createProductRecord({
                            id: `${merchant}_embedded_script_${Date.now()}`,
                            name: candidate.name,
                            description: candidate.description,
                            price: candidate.price,
                            currency: candidate.currency,
                            availability: candidate.availability,
                            variants: candidate.variants,
                            product_url: productUrl,
                            merchant: merchant,
                            source: ProvenanceSourceEnum.LLM_EXTRACTED,
                            confidence: 0.88
                        }));
                        break;
                    }
                } catch (e) {}
            }
        }
    }

    return {
        found: products.length > 0,
        count: products.length,
        products
    };
}

module.exports = {
    extractFromEmbeddedJsonState,
    findProductInState
};
