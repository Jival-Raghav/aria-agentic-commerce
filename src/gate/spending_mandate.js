/**
 * Feature 9: Spending Mandate Object (Enhanced)
 * 
 * Formal authorization contract set by the human before an agent session starts.
 * 
 * Fields:
 * - max_spend: single transaction spend cap
 * - session_budget: cumulative spend cap across the session
 * - daily_budget: rolling 24-hour spend cap
 * - monthly_budget: rolling 30-day spend cap
 * - allowed_merchants: explicit merchant allowlist
 * - blocked_categories: categories permanently denied (gift cards, gambling, etc.)
 * - allowed_categories: explicit category allowlist (if set, only these allowed)
 * - valid_from / expires_at: time-bounded mandate window
 * - allowed_hours: time restriction window { start: 9, end: 18, timezone: 'IST' }
 * - human_approval_threshold: amount above which human must confirm before payment
 * - min_merchant_trust_score: minimum trust score for unknown merchants
 * - max_purchases_per_minute: velocity limit
 * - tamper_hash: SHA256 integrity hash of all mandate parameters
 */

const crypto = require('crypto');

function computeMandateHash(params) {
    const canonicalString = [
        params.mandate_id,
        params.user_id,
        params.max_spend,
        params.session_budget,
        params.daily_budget,
        params.monthly_budget,
        (params.allowed_merchants || []).sort().join(','),
        (params.blocked_categories || []).sort().join(','),
        (params.allowed_categories || []).sort().join(','),
        params.valid_from,
        params.expires_at,
        params.require_confirmation_above,
        params.human_approval_threshold,
        params.min_merchant_trust_score,
        JSON.stringify(params.allowed_hours || {})
    ].join('|');

    return crypto.createHash('sha256').update(canonicalString).digest('hex');
}

/**
 * Creates a valid, cryptographically verifiable spending mandate
 */
function createSpendingMandate(input = {}) {
    const userId = input.userId || input.user_id || 'usr_agent_buyer';
    const maxSpend = Number(input.maxSpend ?? input.max_spend ?? 5000);
    const sessionBudget = Number(input.sessionBudget ?? input.session_budget ?? 15000);
    const dailyBudget = (input.dailyBudget !== undefined || input.daily_budget !== undefined)
        ? Number(input.dailyBudget ?? input.daily_budget)
        : Math.max(100000, maxSpend * 3);
    const monthlyBudget = (input.monthlyBudget !== undefined || input.monthly_budget !== undefined)
        ? Number(input.monthlyBudget ?? input.monthly_budget)
        : Math.max(500000, maxSpend * 10);
    const allowedMerchants = input.allowedMerchants || input.allowed_merchants || [
        'SNAPDEAL', 'NYKAA', 'TATACLIQ', 'AMAZON', 'BOAT-LIFESTYLE', 'BOAT',
        'HEADPHONEZONE', 'SNITCH', 'GIVA', 'MOKOBARA', 'HEADSUPFORTAILS',
        'TWOBROTHERS', 'THEWHOLETRUTH', 'ATOMBERG', 'MIVI', 'QUBO', 'SLURRPFARM',
        'CROSSWORD', 'ZOUK', 'HIDESIGN', 'APPLE', 'NIKE', 'ZARA', 'HM', 'IKEA',
        'CROMA', 'RELIANCEDIGITAL', 'GOBOULT', 'MEESHO', 'FLIPKART', '*'
    ];
    const blockedCategories = input.blockedCategories || input.blocked_categories || ['gambling', 'alcohol', 'crypto', 'gift_cards', 'adult'];
    const allowedCategories = input.allowedCategories || input.allowed_categories || [];
    const ttlHours = input.ttlHours || input.ttl_hours || 24;
    const requireConfirmationAbove = Number(input.requireConfirmationAbove ?? input.require_confirmation_above ?? Math.max(5000, maxSpend));
    const humanApprovalThreshold = Number(input.humanApprovalThreshold ?? input.human_approval_threshold ?? Math.max(10000, maxSpend * 1.5));
    const minMerchantTrustScore = input.minMerchantTrustScore || input.min_merchant_trust_score || 60;
    const allowedHours = input.allowedHours || input.allowed_hours || null;
    const maxPurchasesPerMinute = input.maxPurchasesPerMinute || input.max_purchases_per_minute || 5;

    const mandateId = input.mandate_id || input.mandateId || `mnd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date();
    const validFrom = now.toISOString();
    const expiresAt = new Date(now.getTime() + ttlHours * 3600 * 1000).toISOString();

    const mandate = {
        mandate_id: mandateId,
        user_id: userId,
        max_spend: Number(maxSpend),
        session_budget: Number(sessionBudget),
        daily_budget: Number(dailyBudget),
        monthly_budget: Number(monthlyBudget),
        allowed_merchants: allowedMerchants.map(m => m.toUpperCase()),
        blocked_categories: blockedCategories.map(c => c.toLowerCase()),
        allowed_categories: allowedCategories.map(c => c.toLowerCase()),
        valid_from: validFrom,
        expires_at: expiresAt,
        require_confirmation_above: Number(requireConfirmationAbove),
        human_approval_threshold: Number(humanApprovalThreshold),
        min_merchant_trust_score: Number(minMerchantTrustScore),
        allowed_hours: allowedHours || null,
        max_purchases_per_minute: Number(maxPurchasesPerMinute),
        created_at: validFrom
    };

    mandate.tamper_hash = computeMandateHash(mandate);
    return mandate;
}

/**
 * Verifies the integrity and validity of a spending mandate
 */
function verifyMandate(mandate) {
    if (!mandate || !mandate.mandate_id) {
        return { valid: false, reason: 'NO_MANDATE_OBJECT' };
    }

    // 1. Check expiration
    const now = new Date();
    if (mandate.expires_at && new Date(mandate.expires_at) < now) {
        return { valid: false, reason: 'MANDATE_EXPIRED', expiresAt: mandate.expires_at };
    }

    // 2. Verify tamper hash
    const expectedHash = computeMandateHash(mandate);
    if (mandate.tamper_hash !== expectedHash) {
        return { valid: false, reason: 'MANDATE_TAMPERED', details: 'Cryptographic hash mismatch' };
    }

    return {
        valid: true,
        mandateId: mandate.mandate_id,
        maxSpend: mandate.max_spend,
        sessionBudget: mandate.session_budget,
        dailyBudget: mandate.daily_budget,
        monthlyBudget: mandate.monthly_budget,
        humanApprovalThreshold: mandate.human_approval_threshold,
        expiresAt: mandate.expires_at
    };
}

module.exports = {
    createSpendingMandate,
    verifyMandate,
    computeMandateHash
};
