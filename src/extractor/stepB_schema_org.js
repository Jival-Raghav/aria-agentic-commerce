/**
 * Step B — schema.org JSON-LD Extraction
 * Companion to extractor-implementation-plan.md Step B
 * 
 * Supports:
 * 1. Raw HTML parsing (cheap, server-rendered SEO block)
 * 2. Rendered DOM parsing (client-side React/Next.js hydration pass)
 */

const https = require('https');
const http = require('http');
const { createProductRecord, AvailabilityEnum, ProvenanceSourceEnum } = require('../catalog/schema');

function normalizeAvailability(avail, hasPrice = true) {
    if (!avail || typeof avail !== 'string') {
        return hasPrice ? AvailabilityEnum.IN_STOCK : AvailabilityEnum.UNKNOWN;
    }
    const str = avail.toLowerCase();
    if (str.includes('instock') || str.includes('in_stock') || str.includes('available')) {
        return AvailabilityEnum.IN_STOCK;
    }
    if (str.includes('outofstock') || str.includes('out_of_stock') || str.includes('soldout') || str.includes('unavailable')) {
        return AvailabilityEnum.OUT_OF_STOCK;
    }
    return hasPrice ? AvailabilityEnum.IN_STOCK : AvailabilityEnum.UNKNOWN;
}

function parseJsonLdFromHtml(html, productUrl, merchant) {
    const regex = /<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    const products = [];

    // Extract slug tokens from URL for relevance ranking
    let urlTokens = [];
    try {
        const pathname = new URL(productUrl).pathname.toLowerCase();
        urlTokens = pathname.split(/[\/\-_.]/).filter(t => t.length > 2 && !/^\d+$/.test(t) && t !== 'products' && t !== 'product' && t !== 'buy' && t !== 'item');
    } catch (e) {}

    while ((match = regex.exec(html)) !== null) {
        try {
            const content = match[1].trim();
            const parsed = JSON.parse(content);
            const items = Array.isArray(parsed) ? parsed : (parsed['@graph'] ? parsed['@graph'] : [parsed]);

            for (const item of items) {
                if (item && (item['@type'] === 'Product' || (Array.isArray(item['@type']) && item['@type'].includes('Product')))) {
                    const offer = Array.isArray(item.offers) ? item.offers[0] : (item.offers || {});
                    const rawPrice = offer.price || offer.lowPrice || item.price;
                    const cleanPrice = typeof rawPrice === 'string' ? parseFloat(rawPrice.replace(/[^0-9.]/g, '')) : Number(rawPrice);

                    if (item.name && cleanPrice && !isNaN(cleanPrice) && cleanPrice > 0) {
                        const nameLower = item.name.toLowerCase();
                        if (nameLower.includes('page not found') || nameLower.includes('404') || nameLower.includes('access denied')) {
                            continue;
                        }

                        // Calculate slug overlap score
                        let score = 0;
                        for (const token of urlTokens) {
                            if (nameLower.includes(token)) score++;
                        }

                        const rec = createProductRecord({
                            id: item.sku || item.mpn || `${merchant}_${cleanPrice}_${Date.now()}`,
                            name: item.name,
                            description: item.description || '',
                            price: cleanPrice,
                            currency: offer.priceCurrency || 'INR',
                            availability: normalizeAvailability(offer.availability),
                            variants: item.model ? [item.model] : [],
                            product_url: productUrl,
                            merchant: merchant,
                            source: ProvenanceSourceEnum.SCHEMA_ORG,
                            confidence: 0.95
                        });
                        rec._relevanceScore = score;
                        products.push(rec);
                    }
                }
            }
        } catch (e) {}
    }

    // Sort products so the one with highest relevance to the URL slug is first
    products.sort((a, b) => (b._relevanceScore || 0) - (a._relevanceScore || 0));

    return products;
}

async function fetchRawHtml(url) {
    return new Promise((resolve) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', (err) => resolve({ status: null, body: '', error: err.message }));
        req.setTimeout(2500, () => {
            req.destroy();
            resolve({ status: 'TIMEOUT', body: '', error: 'Timeout' });
        });
    });
}

/**
 * Extracts schema.org from raw HTML
 */
async function extractFromRawHtml(productUrl, merchant) {
    const res = await fetchRawHtml(productUrl);
    if (res.status === 200 && res.body) {
        const products = parseJsonLdFromHtml(res.body, productUrl, merchant);
        return {
            found: products.length > 0,
            pass: 'raw_html',
            rawHtml: res.body,
            products
        };
    }
    return {
        found: false,
        pass: 'raw_html',
        status: res.status,
        rawHtml: res.body || '',
        products: []
    };
}

/**
 * Extracts schema.org from rendered DOM (CDP / Playwright outerHTML)
 */
function extractFromRenderedDom(domHtml, productUrl, merchant) {
    const products = parseJsonLdFromHtml(domHtml, productUrl, merchant);
    if (products.length > 0) {
        return {
            found: true,
            pass: 'rendered_dom',
            products
        };
    }
    return {
        found: false,
        pass: 'rendered_dom',
        products: []
    };
}

module.exports = {
    extractFromRawHtml,
    extractFromRenderedDom,
    parseJsonLdFromHtml
};
