/**
 * Unified Catalog — Product Schema Contract
 * Companion to README.md Section 5.1
 */

const AvailabilityEnum = {
    IN_STOCK: 'in_stock',
    OUT_OF_STOCK: 'out_of_stock',
    UNKNOWN: 'unknown'
};

const ProvenanceSourceEnum = {
    MANIFEST: 'manifest',
    SCHEMA_ORG: 'schema_org',
    LLM_EXTRACTED: 'llm_extracted',
    CACHED_SNAPSHOT: 'cached_snapshot'
};

/**
 * Creates a normalized Product record matching README Section 5.1
 */
function createProductRecord({
    id,
    name,
    description = '',
    price,
    currency = 'INR',
    availability = AvailabilityEnum.UNKNOWN,
    variants = [],
    product_url,
    merchant = '',
    checkout_action = null,
    source = ProvenanceSourceEnum.SCHEMA_ORG,
    confidence = 1.0,
    captured_at = new Date().toISOString()
}) {
    return {
        id: String(id || `${merchant}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`),
        name: String(name || '').trim(),
        description: String(description || '').trim(),
        price: Number(price),
        currency: String(currency || 'INR').toUpperCase(),
        availability: Object.values(AvailabilityEnum).includes(availability) ? availability : AvailabilityEnum.UNKNOWN,
        variants: Array.isArray(variants) ? variants : [],
        product_url: String(product_url || ''),
        merchant: String(merchant || ''),
        checkout_action: checkout_action ? {
            type: checkout_action.type || 'direct_api',
            method: checkout_action.method || 'POST',
            url: checkout_action.url || '',
            payload: checkout_action.payload || null,
            headers: checkout_action.headers || {},
            button_selector: checkout_action.button_selector || null
        } : null,
        source: Object.values(ProvenanceSourceEnum).includes(source) ? source : ProvenanceSourceEnum.LLM_EXTRACTED,
        confidence: typeof confidence === 'number' ? Math.max(0, Math.min(1, confidence)) : 0.8,
        captured_at: captured_at || new Date().toISOString()
    };
}

module.exports = {
    AvailabilityEnum,
    ProvenanceSourceEnum,
    createProductRecord
};
