/**
 * Unified Catalog — Enhanced Query Engine with Strict Semantic Matching
 */

const { AvailabilityEnum, ProvenanceSourceEnum } = require('./schema');

class UnifiedCatalog {
    constructor() {
        this.products = new Map();
    }

    upsert(productOrList) {
        const items = Array.isArray(productOrList) ? productOrList : [productOrList];
        const added = [];
        for (const item of items) {
            if (item && item.id) {
                if (!item.availability && item.in_stock === true) {
                    item.availability = AvailabilityEnum.IN_STOCK;
                }
                this.products.set(item.id, item);
                added.push(item);
            }
        }
        return added;
    }

    getById(id) {
        return this.products.get(id) || null;
    }

    getAll() {
        return Array.from(this.products.values());
    }

    /**
     * Search with strict keyword relevance and constraint filtering
     */
    search({
        query = '',
        merchant = null,
        maxPrice = Infinity,
        minPrice = 0,
        inStockOnly = true,
        allowedSources = null,
        preferLive = true
    } = {}) {
        let results = Array.from(this.products.values());

        // 1. Merchant filter
        if (merchant) {
            const m = merchant.toLowerCase();
            results = results.filter(p => p.merchant && p.merchant.toLowerCase().includes(m));
        }

        // 2. Price filter
        results = results.filter(p => p.price >= minPrice && p.price <= maxPrice);

        // 3. Availability filter (filter out explicitly out-of-stock items)
        if (inStockOnly) {
            results = results.filter(p => p.availability !== AvailabilityEnum.OUT_OF_STOCK && p.in_stock !== false);
        }

        // 4. Allowed sources filter
        if (allowedSources && Array.isArray(allowedSources)) {
            results = results.filter(p => allowedSources.includes(p.source));
        }

        // 5. Semantic & Keyword matching
        if (query && query.trim().length > 0) {
            // Filter out common filler words
            const stopwords = new Set(['find', 'buy', 'get', 'show', 'me', 'a', 'an', 'the', 'under', 'below', 'less', 'than', 'rs', 'rupees', 'in', 'on', 'at', 'from', 'for', 'with', 'and', 'or', 'is', 'stock']);
            const tokens = query.toLowerCase()
                .replace(/[^a-z0-9\s]/g, '')
                .split(/\s+/)
                .filter(t => t.length > 1 && !stopwords.has(t) && isNaN(Number(t)));

            if (tokens.length === 0) {
                return results;
            }

            // Expand tokens with generic category synonyms (purely functional, NO brand bias)
            const expandedTokens = new Set(tokens);
            if (tokens.some(t => /phone|mobile|smartphone/i.test(t))) {
                ['phone', 'mobile', 'smartphone'].forEach(syn => expandedTokens.add(syn));
            }
            if (tokens.some(t => /earphone|headphone|earbud|audio|sound|headset/i.test(t))) {
                ['headphone', 'earphone', 'earbud', 'audio', 'headset'].forEach(syn => expandedTokens.add(syn));
            }
            if (tokens.some(t => /shirt|tshirt|top|apparel/i.test(t))) {
                ['shirt', 'tee', 'tshirt', 'apparel'].forEach(syn => expandedTokens.add(syn));
            }
            if (tokens.some(t => /suitcase|luggage|trolley|bag|backpack/i.test(t))) {
                ['suitcase', 'luggage', 'trolley', 'bag', 'cabin'].forEach(syn => expandedTokens.add(syn));
            }
            if (tokens.some(t => /guitar|ukulele|instrument/i.test(t))) {
                ['guitar', 'acoustic', 'electric'].forEach(syn => expandedTokens.add(syn));
            }

            const scored = [];
            for (const p of results) {
                const targetText = `${p.name} ${p.description || ''} ${p.merchant || ''} ${p.product_url || ''}`.toLowerCase();
                let matchedTokens = 0;
                let score = 0;

                for (const t of expandedTokens) {
                    if (targetText.includes(t)) {
                        matchedTokens++;
                        // Higher weight for exact title matches
                        score += p.name.toLowerCase().includes(t) ? 5 : 2;
                    }
                }

                // If at least one distinct keyword matches, score and rank it
                if (matchedTokens >= 1) {
                    const matchRatio = matchedTokens / expandedTokens.size;
                    scored.push({ product: p, score, matchRatio, matchedTokens });
                }
            }

            // Sort by match quality, live provenance, and confidence
            scored.sort((a, b) => {
                if (b.matchRatio !== a.matchRatio) return b.matchRatio - a.matchRatio;
                if (b.score !== a.score) return b.score - a.score;
                if (preferLive) {
                    const aLive = a.product.source !== ProvenanceSourceEnum.CACHED_SNAPSHOT ? 1 : 0;
                    const bLive = b.product.source !== ProvenanceSourceEnum.CACHED_SNAPSHOT ? 1 : 0;
                    if (bLive !== aLive) return bLive - aLive;
                }
                return (b.product.confidence || 0) - (a.product.confidence || 0);
            });

            return scored.map(s => s.product);
        }

        return results;
    }

    clear() {
        this.products.clear();
    }
}

module.exports = {
    UnifiedCatalog
};
