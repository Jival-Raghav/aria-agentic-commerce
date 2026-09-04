/**
 * Step C (Pattern Library) — CSS Selector Pattern Heuristics
 * Layer D2 in the Universal Extractor Cascade
 * 
 * Ranked CSS pattern matcher across Indian e-commerce & standard e-commerce platforms:
 * - WooCommerce, Shopify, Magento / Adobe Commerce, BigCommerce, OpenCart, PrestaShop
 * - Custom Indian D2C storefronts (e.g. Dukaan, Bikayi, StoreHippo, custom React/HTML)
 * 
 * Features Strikethrough / MRP Filter:
 * Specifically rejects <del>, <s>, .strike, .mrp, .original-price, and line-through styles
 * to guarantee extraction of the true SALE/OFFER price, never the higher crossed-out MRP.
 */

const { createProductRecord, AvailabilityEnum, ProvenanceSourceEnum } = require('../catalog/schema');

/**
 * Client-side script evaluated in headless Chrome to extract product details via pattern library
 */
const DOM_PATTERN_EXTRACTOR_SCRIPT = `
(() => {
    // 1. Ranked Title Selectors
    const TITLE_SELECTORS = [
        '[itemprop="name"]',
        'h1.product-title',
        'h1.product_title',
        'h1.pdp-title',
        'h1.product-name',
        'h1.product__title',
        'h1.product-meta__title',
        '.product-details h1',
        '.pdp-details h1',
        'h1.title',
        '[data-ui-id="page-title-wrapper"]',
        'h1'
    ];

    const DENYLIST = ['404', 'not found', 'page not found', 'we can\'t find', 'could not find', 'access denied', 'robot check', 'security check', 'just a moment', 'attention required', 'products', 'category', 'collection', 'shop now', 'online store', 'home page'];
    let extractedTitle = '';
    for (const sel of TITLE_SELECTORS) {
        const el = document.querySelector(sel);
        if (el) {
            const txt = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
            const lower = txt.toLowerCase();
            if (txt.length > 3 && !lower.includes('shopping cart') && !lower.includes('checkout') && !DENYLIST.some(d => lower.includes(d))) {
                extractedTitle = txt;
                break;
            }
        }
    }

    // 2. Strikethrough & MRP Detector (Helper)
    function isStrikethroughOrMrp(el) {
        if (!el) return false;
        const tag = el.tagName ? el.tagName.toUpperCase() : '';
        if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE') return true;

        const classAndId = ((el.className || '') + ' ' + (el.id || '')).toLowerCase();
        const mrpPatterns = ['mrp', 'strike', 'original-price', 'was-price', 'old-price', 'compare-at-price', 'list-price', 'strikethrough', 'crossed-out', 'regular-price'];
        for (const pat of mrpPatterns) {
            if (classAndId.includes(pat) && !classAndId.includes('special') && !classAndId.includes('offer')) {
                return true;
            }
        }

        // Check computed CSS text-decoration if available
        try {
            const style = window.getComputedStyle(el);
            if (style && style.textDecoration && style.textDecoration.includes('line-through')) {
                return true;
            }
        } catch (e) {}

        // Check parent element
        if (el.parentElement && (el.parentElement.tagName === 'DEL' || el.parentElement.tagName === 'S')) {
            return true;
        }

        return false;
    }

    // 3. Ranked Sale & Offer Price Selectors (Prioritized over generic prices)
    const SALE_PRICE_SELECTORS = [
        '.special-price .price',
        '.offer-price',
        '.selling-price',
        '.final-price',
        '.discounted-price',
        '[itemprop="price"]',
        '.product-price .price',
        '.pdp-price',
        '.price-box .price',
        '.product__price',
        'span.woocommerce-Price-amount',
        '.money',
        '[data-product-price]',
        '[data-price]',
        'span.a-price-whole',
        '.product-price',
        '.price'
    ];

    let extractedPrice = null;
    let extractedCurrency = 'INR';
    const candidatePrices = [];

    for (const sel of SALE_PRICE_SELECTORS) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
            // Strictly SKIP strikethrough or MRP elements
            if (isStrikethroughOrMrp(el)) {
                continue;
            }

            // Check attribute first
            const attrPrice = el.getAttribute('content') || el.getAttribute('data-price') || el.getAttribute('value');
            if (attrPrice) {
                const num = parseFloat(attrPrice.replace(/[^0-9.]/g, ''));
                if (!isNaN(num) && num > 0 && num < 1000000) {
                    candidatePrices.push(num);
                }
            }

            const txt = (el.innerText || el.textContent || '').trim();
            if (txt.includes('$')) extractedCurrency = 'USD';
            if (txt.includes('€')) extractedCurrency = 'EUR';
            if (txt.includes('£')) extractedCurrency = 'GBP';

            const match = txt.match(/(?:₹|Rs\\.?|INR|\\$|€|£)?\\s*([0-9,]+(?:\\.[0-9]{2})?)/i);
            if (match && match[1]) {
                const num = parseFloat(match[1].replace(/,/g, ''));
                if (!isNaN(num) && num > 0 && num < 1000000) {
                    candidatePrices.push(num);
                }
            }
        }
    }

    // If candidate prices exist, pick the lowest valid price (Sale price is always <= MRP)
    if (candidatePrices.length > 0) {
        extractedPrice = Math.min(...candidatePrices);
    }

    // Fallback: Product container scan (with strikethrough filtering)
    if (extractedPrice === null) {
        const container = document.querySelector('.product-info, .product-detail, .pdp-container, main, body');
        if (container) {
            const priceElements = container.querySelectorAll('span, p, div, b, strong');
            const fallbackCandidates = [];
            for (const el of priceElements) {
                if (isStrikethroughOrMrp(el)) continue;
                const txt = el.innerText || '';
                const match = txt.match(/(?:₹|Rs\\.?|INR)\\s*([0-9,]+(?:\\.[0-9]{2})?)/i);
                if (match && match[1]) {
                    const num = parseFloat(match[1].replace(/,/g, ''));
                    if (!isNaN(num) && num >= 5 && num < 1000000) {
                        fallbackCandidates.push(num);
                    }
                }
            }
            if (fallbackCandidates.length > 0) {
                extractedPrice = Math.min(...fallbackCandidates);
            }
        }
    }

    // 4. Stock Availability
    let extractedAvailability = 'in_stock';
    const bodyText = (document.body ? document.body.innerText : '').toLowerCase();
    const outOfStockTerms = ['out of stock', 'sold out', 'currently unavailable', 'item unavailable'];
    for (const term of outOfStockTerms) {
        if (bodyText.includes(term)) {
            extractedAvailability = 'out_of_stock';
            break;
        }
    }

    // 5. Description snippet
    let extractedDesc = '';
    const descEl = document.querySelector('[itemprop="description"], .product-description, .pdp-description, #description, .description');
    if (descEl) {
        extractedDesc = (descEl.innerText || descEl.textContent || '').slice(0, 300).trim();
    }

    return {
        title: extractedTitle,
        price: extractedPrice,
        currency: extractedCurrency,
        availability: extractedAvailability,
        description: extractedDesc
    };
})()
`;

async function extractWithDomPatterns(pageClient, productUrl, merchant) {
    try {
        const evalRes = await pageClient.send('Runtime.evaluate', {
            expression: DOM_PATTERN_EXTRACTOR_SCRIPT,
            returnByValue: true
        });

        const data = evalRes.result?.value;
        if (data && data.title && data.price) {
            const product = createProductRecord({
                id: `${merchant}_pattern_${Date.now()}`,
                name: data.title,
                description: data.description || `Extracted via DOM Pattern Library (${merchant})`,
                price: Number(data.price),
                currency: data.currency || 'INR',
                availability: data.availability === 'out_of_stock' ? AvailabilityEnum.OUT_OF_STOCK : AvailabilityEnum.IN_STOCK,
                variants: [],
                product_url: productUrl,
                merchant: merchant,
                source: ProvenanceSourceEnum.LLM_EXTRACTED,
                confidence: 0.85
            });

            return {
                found: true,
                method: 'dom_pattern_library',
                product
            };
        }
    } catch (e) {
        return { found: false, error: e.message };
    }

    return { found: false, error: 'DOM patterns did not match required fields (title/price)' };
}

module.exports = {
    extractWithDomPatterns,
    DOM_PATTERN_EXTRACTOR_SCRIPT
};
