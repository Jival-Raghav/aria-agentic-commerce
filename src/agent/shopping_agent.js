/**
 * Shopping Agent — Goal-Driven Multi-Store Search, Cross-Site Comparison & Purchase Engine
 */

const { UnifiedCatalog } = require('../catalog/catalog');
const { AvailabilityEnum, ProvenanceSourceEnum } = require('../catalog/schema');
const { discoverProductUrls, isPdpUrl } = require('../extractor/search_discovery');
const { parseGoal: parseGoalIntent } = require('./intent_parser');

function matchesCategory(product, intent) {
    if (!intent) return true;
    const cat = (typeof intent === 'string' ? intent : intent.category || '').toLowerCase();
    const isAccessory = typeof intent === 'object' ? intent.isAccessory === true : false;
    const targetProduct = typeof intent === 'object' ? (intent.targetProduct || '').toLowerCase() : '';

    const name = (product.name || '').toLowerCase();
    const desc = (product.description || '').toLowerCase();
    const categoryField = (product.category || '').toLowerCase();
    const text = `${name} ${desc} ${categoryField}`;

    // 1. Accessory / Care Category Distinctions (e.g. shoe cleaner vs shoes)
    if (cat === 'shoe_care' || (isAccessory && (targetProduct.includes('shoe') || targetProduct.includes('cleaner')))) {
        return /cleaner|polish|brush|foam|care|spray|kit|crease|wipes|shampoo|sponge/i.test(text);
    }
    if (cat === 'musical_accessories' || (isAccessory && (targetProduct.includes('guitar') || targetProduct.includes('string')))) {
        return /string|pick|strap|capo|stand|tuner|case|cable|lead/i.test(text);
    }
    if (cat === 'laptop_accessories' || (isAccessory && (targetProduct.includes('laptop') || targetProduct.includes('stand')))) {
        return /stand|riser|skin|cover|bag|sleeve|case|charger|adapter|hub/i.test(text);
    }
    if (cat === 'phone_accessories' || (isAccessory && (targetProduct.includes('phone') || targetProduct.includes('case')))) {
        return /case|cover|protector|holder|stand|cable|charger|adapter|tripod|selfie/i.test(text);
    }

    // 2. Primary Device / Item Categories (Reject accessories)
    if (cat === 'shoes' || cat === 'footwear') {
        const isShoe = /shoe|sneaker|footwear|runner|trainer|running|slide|clog|boot|loafers|oxford|sandal|slipper/i.test(text);
        const isShoeAccessory = /cleaner|polish|brush|lace|wipes|kit|foam|spray|crease\s+protector/i.test(name);
        return isShoe && !isShoeAccessory;
    }
    if (cat === 'audio' || cat === 'headphone') {
        const isAudio = /headphone|earphone|earbud|airpod|headset|tws|neckband|iem|in-ear|audio/i.test(text);
        const isAudioAccessory = /case\s+cover|silicone\s+case|eartips|earpad|cable|stand/i.test(name);
        return isAudio && !isAudioAccessory;
    }
    if (cat === 'laptop') {
        const isLaptop = /laptop|notebook|chromebook|macbook/i.test(text);
        const isLaptopAccessory = /skin|cover|bag|sleeve|stand|charger|adapter|cable|keyboard\s+cover/i.test(name);
        return isLaptop && !isLaptopAccessory;
    }
    if (cat === 'phone') {
        const isPhone = /\b(?:smart)?phone[s]?\b|\bmobile[s]?\b/i.test(text);
        const isPhoneAccessory = /case|cover|stand|cable|protector|holder|tripod|selfie|skin|charger/i.test(name);
        return isPhone && !isPhoneAccessory;
    }
    if (cat === 'guitar' || cat === 'musical_instruments') {
        const isGuitar = /guitar|ukulele|acoustic|electric|instrument/i.test(text);
        const isGuitarAccessory = /bulb|strap|string\s+set|strings\b|tuner\b|pick\b|capo\b|stand\b/i.test(name);
        return isGuitar && !isGuitarAccessory;
    }
    if (cat === 'speaker') return /speaker|soundbar|audio/i.test(text);
    if (cat === 'shirt' || cat === 'apparel') return /shirt|tshirt|tee|polo|top|apparel/i.test(text);
    if (cat === 'watch' || cat === 'watches') return /watch|smartwatch|timepiece/i.test(text);
    if (cat === 'bat') return /bat\b|willow/i.test(text) && !/key\s*chain|sticker|grip\b/i.test(name);

    return true;
}

class ShoppingAgent {
    constructor(catalog = null) {
        this.catalog = catalog || new UnifiedCatalog();
    }

    /**
     * Parses user goal using Groq LPU semantic extractor with deterministic fallback
     */
    async parseGoal(goal) {
        return parseGoalIntent(goal);
    }
    async searchAndShop(goalText, cascade, optionsOrProgress = null, maybeProgress = null) {
        let options = {};
        let onProgress = null;
        if (typeof optionsOrProgress === 'function') {
            onProgress = optionsOrProgress;
        } else if (optionsOrProgress && typeof optionsOrProgress === 'object') {
            options = optionsOrProgress;
            if (typeof maybeProgress === 'function') {
                onProgress = maybeProgress;
            }
        }

        const parsed = await this.parseGoal(goalText);
        const decisionTrace = [
            `Goal received: "${goalText}"`,
            `Parsed search terms: "${parsed.searchQuery}", Category: ${parsed.category || 'Any'}, Brand: ${parsed.brand || 'Any'}, Target Budget: ₹${parsed.minPrice} – ₹${parsed.maxPrice === Infinity ? 'Unlimited' : parsed.maxPrice}, Target Merchant: ${parsed.merchant ? parsed.merchant.toUpperCase() : 'All Available'}`
        ];

        if (onProgress) onProgress({ step: 'PARSED', message: `Parsed goal: "${parsed.searchQuery}" (Target Budget: ₹${parsed.minPrice} - ₹${parsed.maxPrice})` });

        // Query-scoped fresh catalog to prevent cross-query contamination
        const queryCatalog = new UnifiedCatalog();

        // 1. Discover Product Candidate URLs across multiple stores & D2C engines
        if (onProgress) onProgress({ step: 'SEARCHING', message: `Searching open web & D2C stores for "${parsed.searchQuery}"...` });

        let candidateUrls = [];
        try {
            candidateUrls = await discoverProductUrls(parsed.searchQuery, {
                maxResults: 6,
                minPrice: parsed.minPrice,
                targetMerchant: parsed.merchant,
                searchEngine: options.searchEngine || 'auto'
            });
        } catch (e) {
            decisionTrace.push(`Search discovery error: ${e.message}`);
        }

        decisionTrace.push(`Discovered ${candidateUrls.length} live product candidate URL(s) across distinct stores.`);

        if (onProgress) onProgress({ step: 'EXTRACTING', message: `Found ${candidateUrls.length} live stores. Running Extractor Cascade in parallel...` });

        // 2. Run Extractor Cascade on discovered PDPs (in parallel) & ingest structured items
        const rawExtracted = [];
        const extractionPromises = [];

        for (const item of candidateUrls) {
            if (typeof item === 'string') {
                extractionPromises.push((async () => {
                    try {
                        const extResult = await cascade.extract(item);
                        if (extResult.status === 'SUCCESS' && extResult.product) {
                            return { success: true, product: extResult.product, winning_step: extResult.winning_step };
                        }
                        return { success: false, url: item, status: extResult.status };
                    } catch (e) {
                        return { success: false, url: item, error: e.message };
                    }
                })());
            } else if (item && typeof item === 'object' && item.name) {
                if (item.product_url && isPdpUrl(item.product_url)) {
                    extractionPromises.push((async () => {
                        try {
                            const extResult = await cascade.extract(item.product_url);
                            if (extResult.status === 'SUCCESS' && extResult.product) {
                                return { success: true, product: extResult.product, winning_step: extResult.winning_step };
                            }
                        } catch (e) {}
                        return { success: true, product: item, winning_step: 'Structured Search Engine' };
                    })());
                } else {
                    rawExtracted.push(item);
                    decisionTrace.push(`✓ Ingested from ${item.merchant}: "${item.name}" @ ₹${item.price} (via Structured Search Engine).`);
                }
            }
        }

        const extractionResults = await Promise.all(extractionPromises);

        for (const res of extractionResults) {
            if (res.success && res.product) {
                rawExtracted.push(res.product);
                decisionTrace.push(`✓ Extracted from ${res.product.merchant}: "${res.product.name}" @ ₹${res.product.price} (via ${res.winning_step}).`);
            } else if (res.url) {
                decisionTrace.push(`✗ Skipped ${res.url} (${res.status || res.error || 'Extraction failed'}).`);
            }
        }

        // Filter by requested product category to prevent cross-category contamination
        const validExtracted = rawExtracted.filter(p => matchesCategory(p, parsed.category));

        if (validExtracted.length === 0 && rawExtracted.length > 0) {
            decisionTrace.push(`✗ Filtered out ${rawExtracted.length} candidate(s) because none matched requested category "${parsed.category}".`);
            return {
                success: false,
                reason: `No products matching category "${parsed.category}" found within your budget of ₹${parsed.maxPrice === Infinity ? 'Unlimited' : parsed.maxPrice}.`,
                decision_trace: decisionTrace
            };
        }

        // Ingest validated items into query catalog
        for (const item of validExtracted) {
            queryCatalog.upsert(item);
            this.catalog.upsert(item);
        }

        // 3. Query Catalog with Budget Tier Normalization
        if (onProgress) onProgress({ step: 'EVALUATING', message: `Evaluating candidates across stores against budget tier (₹${parsed.minPrice} – ₹${parsed.maxPrice})...` });

        let matches = queryCatalog.search({
            query: parsed.searchQuery,
            merchant: parsed.merchant,
            maxPrice: parsed.maxPrice,
            minPrice: parsed.minPrice,
            inStockOnly: parsed.inStockOnly,
            preferLive: true
        });

        // Fallback 1: If no items found in strict tier on requested merchant, try relaxed minPrice on requested merchant
        if (matches.length === 0 && parsed.minPrice > 0 && parsed.merchant) {
            matches = queryCatalog.search({
                query: parsed.searchQuery,
                merchant: parsed.merchant,
                maxPrice: parsed.maxPrice,
                minPrice: 0,
                inStockOnly: parsed.inStockOnly,
                preferLive: true
            });
        }

        let requestedStoreUnavailable = false;
        // Fallback 2: If requested merchant had no items within budget, fall back to ANY verified merchant!
        if (matches.length === 0 && parsed.merchant) {
            matches = queryCatalog.search({
                query: parsed.searchQuery,
                maxPrice: parsed.maxPrice,
                minPrice: parsed.minPrice,
                inStockOnly: parsed.inStockOnly,
                preferLive: true
            });
            if (matches.length > 0) {
                requestedStoreUnavailable = true;
                decisionTrace.push(`⚠️ Requested store "${parsed.merchant.toUpperCase()}" had no items within budget. Auto-falling back to verified alternatives.`);
            }
        }

        // Fallback 3: If strict tier on any merchant yielded nothing, search relaxed minPrice
        if (matches.length === 0 && parsed.minPrice > 0) {
            matches = queryCatalog.search({
                query: parsed.searchQuery,
                maxPrice: parsed.maxPrice,
                minPrice: 0,
                inStockOnly: parsed.inStockOnly,
                preferLive: true
            });
            if (matches.length > 0) {
                decisionTrace.push(`Relaxed budget tier floor to find candidate options.`);
            }
        }

        // Fallback 4: If text query scoring had no hits, use direct category-validated items
        if (matches.length === 0 && validExtracted.length > 0) {
            matches = validExtracted.filter(p => p.price <= parsed.maxPrice);
            if (matches.length > 0) {
                decisionTrace.push(`Using ${matches.length} direct extracted item(s) within budget limit.`);
            }
        }

        if (matches.length === 0) {
            decisionTrace.push(`No products matched budget limit of ₹${parsed.maxPrice} on any verified store.`);
            return {
                success: false,
                reason: `No matching products found within budget of ₹${parsed.maxPrice} on any verified store.`,
                decision_trace: decisionTrace
            };
        }

        // Filter matches strictly by category
        matches = matches.filter(p => matchesCategory(p, parsed.category));

        if (matches.length === 0) {
            return {
                success: false,
                reason: `No products matching category "${parsed.category}" found within budget.`,
                decision_trace: decisionTrace
            };
        }

        // 4. Build Cross-Store Comparison Matrix (Top 3 Distinct Options)
        const distinctMerchantMap = new Map();
        for (const p of matches) {
            const m = p.merchant.toLowerCase();
            if (!distinctMerchantMap.has(m)) {
                distinctMerchantMap.set(m, p);
            }
            if (distinctMerchantMap.size >= 3) break;
        }

        const comparisonList = Array.from(distinctMerchantMap.values());
        
        // Sort: Prioritize requested merchant, requested brand, and best tier value!
        comparisonList.sort((a, b) => {
            // 1. Requested store priority (if requested)
            if (parsed.merchant && !requestedStoreUnavailable) {
                const aIsTarget = (a.merchant || '').toLowerCase().includes(parsed.merchant.toLowerCase());
                const bIsTarget = (b.merchant || '').toLowerCase().includes(parsed.merchant.toLowerCase());
                if (aIsTarget && !bIsTarget) return -1;
                if (!aIsTarget && bIsTarget) return 1;
            }
            // 2. Requested brand priority (if requested)
            if (parsed.brand) {
                const aHasBrand = (a.name + ' ' + (a.merchant || '')).toLowerCase().includes(parsed.brand);
                const bHasBrand = (b.name + ' ' + (b.merchant || '')).toLowerCase().includes(parsed.brand);
                if (aHasBrand && !bHasBrand) return -1;
                if (!aHasBrand && bHasBrand) return 1;
            }
            const inTierA = a.price <= parsed.maxPrice && a.price >= parsed.minPrice;
            const inTierB = b.price <= parsed.maxPrice && b.price >= parsed.minPrice;
            if (inTierA && !inTierB) return -1;
            if (!inTierA && inTierB) return 1;
            return b.price - a.price;
        });

        const topPick = comparisonList[0];
        
        const comparisonMatrix = comparisonList.map((item, idx) => ({
            role: idx === 0 ? 'TOP PICK' : 'ALTERNATIVE',
            product: item,
            name: item.name,
            price: item.price,
            merchant: item.merchant,
            url: item.product_url
        }));

        decisionTrace.push(`Constructed Cross-Store Comparison Matrix with ${comparisonMatrix.length} verified merchant options.`);
        decisionTrace.push(`Selected Top Pick: "${topPick.name}" from ${topPick.merchant} at ₹${topPick.price}.`);

        const isWithinTier = topPick.price >= parsed.minPrice && topPick.price <= parsed.maxPrice;
        const budgetTierText = isWithinTier
            ? `within target budget tier of ₹${parsed.minPrice} – ₹${parsed.maxPrice}`
            : `within stated budget limit of ₹${parsed.maxPrice}`;

        const topPickHasBrand = parsed.brand ? (topPick.name + ' ' + (topPick.merchant || '')).toLowerCase().includes(parsed.brand) : true;

        let reasoning = '';
        if (requestedStoreUnavailable) {
            reasoning = `⚠️ Note: You requested items from ${parsed.merchant.toUpperCase()}, but no matching products under ₹${parsed.maxPrice === Infinity ? 'your budget' : parsed.maxPrice} were available. Auto-falling back to verified alternative from ${topPick.merchant}: "${topPick.name}" @ ₹${topPick.price}.`;
        } else if (parsed.brand && !topPickHasBrand) {
            reasoning = `⚠️ Note: You requested ${parsed.brand.toUpperCase()} items, but none were available under ₹${parsed.maxPrice}. Selected best verified alternative from ${topPick.merchant}: "${topPick.name}" priced at ₹${topPick.price} (${budgetTierText}).`;
        } else if (parsed.brand && parsed.merchant) {
            reasoning = `Selected top matching ${parsed.brand.toUpperCase()} product from requested store ${topPick.merchant.toUpperCase()}: "${topPick.name}" priced at ₹${topPick.price} (${budgetTierText}).`;
        } else if (parsed.brand) {
            reasoning = `Selected top matching ${parsed.brand.toUpperCase()} product from ${topPick.merchant}: "${topPick.name}" priced at ₹${topPick.price} (${budgetTierText}).`;
        } else if (parsed.merchant) {
            reasoning = `Selected top matching item from your requested store ${topPick.merchant.toUpperCase()}: "${topPick.name}" priced at ₹${topPick.price} (${budgetTierText}).`;
        } else {
            reasoning = `Selected "${topPick.name}" from ${topPick.merchant} as the Top Pick for "${parsed.searchQuery}". Priced at ₹${topPick.price} (${budgetTierText}), in-stock, and validated with ${(topPick.confidence * 100).toFixed(0)}% data provenance score.`;
        }

        return {
            success: true,
            parsedIntent: parsed,
            candidateUrls,
            extractedCount: validExtracted.length,
            proposal: {
                product: topPick,
                price_at_decision: topPick.price,
                merchant: topPick.merchant,
                reasoning,
                decision_trace: decisionTrace,
                comparisonMatrix,
                alternatives: comparisonList.slice(1)
            }
        };
    }
}

module.exports = {
    ShoppingAgent
};
