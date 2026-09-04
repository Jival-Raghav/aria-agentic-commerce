/**
 * Feature 4 & 9: Deterministic Policy Gate (Enhanced — v2)
 * 
 * Strict rule-based guardrail (NO LLMs). Enforces:
 * 
 *  EXISTING:
 *  1.  Spending Mandate cryptographic integrity & expiry (Feature 9)
 *  2.  Data freshness / trust (rejects STALE_DATA)
 *  3.  Stock availability
 *  4.  Merchant allowlist
 *  5.  Single transaction spend limit
 *  6.  Session budget cap & txn count
 *  7.  Live price integrity (Feature 5)
 * 
 *  NEW (v2):
 *  8.  Velocity check (rate limiting)
 *  9.  Price reasonableness (extraction error detection)
 *  10. Subscription / recurring payment detection
 *  11. Category restrictions (blocked & allowed lists)
 *  12. Dynamic merchant trust score (DNS + HTTPS + schema signals)
 *  13. Rolling daily & monthly budget tracking
 *  14. Time window restrictions (e.g. office-hours-only)
 *  15. Goal-purchase alignment (semantic match of user intent vs product)
 *  16. Human approval threshold (pause & require human confirm for large amounts)
 */

const { AvailabilityEnum, ProvenanceSourceEnum } = require('../catalog/schema');
const { verifyMandate } = require('./spending_mandate');
const { validatePriceReasonableness, detectSubscriptionSignal } = require('./price_reasonableness');
const { scoreMerchantTrust } = require('./merchant_trust');

// Rolling spend tracking (in-memory, per server session)
// Keyed by userId or 'default'
const rollingSpend = new Map(); // userId -> { daily: [{ts, amount}], monthly: [{ts, amount}] }

function getRollingSpend(userId) {
    if (!rollingSpend.has(userId)) {
        rollingSpend.set(userId, { daily: [], monthly: [] });
    }
    const store = rollingSpend.get(userId);
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const monthMs = 30 * dayMs;
    store.daily = store.daily.filter(e => now - e.ts < dayMs);
    store.monthly = store.monthly.filter(e => now - e.ts < monthMs);
    return store;
}

function recordSpend(userId, amount) {
    const store = getRollingSpend(userId);
    const now = Date.now();
    store.daily.push({ ts: now, amount });
    store.monthly.push({ ts: now, amount });
}

/**
 * Goal-Purchase Alignment Checker
 * Extracts intent keywords from user goal and checks that the product
 * name/category contains at least one matching keyword.
 * NO LLMs — pure regex/stopword keyword intersection.
 */
function checkGoalAlignment(userGoal, product) {
    if (!userGoal || !product) return { aligned: true, reason: 'No goal to match' };

    const STOPWORDS = new Set([
        'find', 'get', 'buy', 'purchase', 'order', 'want', 'need', 'looking',
        'for', 'me', 'a', 'an', 'the', 'some', 'any', 'please', 'under',
        'below', 'above', 'around', 'within', 'in', 'rupees', 'rs', 'inr',
        'price', 'cost', 'budget', 'stock', 'available', 'good', 'best',
        'cheap', 'affordable', 'quality', 'nice', 'quick', 'fast', 'india'
    ]);

    // Extract meaningful keywords from user goal
    const goalWords = userGoal
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));

    if (goalWords.length === 0) return { aligned: true, reason: 'Goal too short to validate alignment' };

    // Strict Core Category Check: The product title must match the category if specified in user goal
    const titleLower = (product.name || '').toLowerCase();
    const userGoalLower = (userGoal || '').toLowerCase();

    const productText = `${product.name || ''} ${product.description || ''} ${product.merchant || ''} ${product.product_url || ''} ${product.category || ''}`.toLowerCase();

    if (/laptop|notebook|chromebook|macbook/i.test(userGoalLower)) {
        const isLaptop = /laptop|notebook|chromebook|macbook/i.test(productText) && !/headphone|earphone|cable|adapter|bag|backpack|stand|sleeve|mouse/i.test(titleLower);
        if (!isLaptop) {
            return {
                aligned: false,
                reason: `Category mismatch: User requested a "laptop", but candidate "${product.name}" is not a laptop.`
            };
        }
    }
    if (/\b(?:smart)?phone[s]?\b|\bmobile[s]?\b/i.test(userGoalLower) && !/headphone|earphone/i.test(userGoalLower)) {
        const isPhone = /\b(?:smart)?phone[s]?\b|\bmobile[s]?\b/i.test(productText) && !/case|cover|stand|cable|protector|holder|tripod|selfie|headphone|earphone/i.test(titleLower);
        if (!isPhone) {
            return {
                aligned: false,
                reason: `Category mismatch: User requested a "smartphone", but candidate "${product.name}" is not a phone.`
            };
        }
    }
    if (/headphone|earphone|earbud|airpod|headset/i.test(userGoalLower)) {
        const isHeadphone = /headphone|earphone|earbud|airpod|headset|tws|neckband|iem|in-ear|audio/i.test(productText) && !/case|cable|stand|adapter|cover/i.test(titleLower);
        if (!isHeadphone) {
            return {
                aligned: false,
                reason: `Category mismatch: User requested "headphones", but candidate "${product.name}" is not a headphone.`
            };
        }
    }

    // Check how many goal keywords or synonyms appear in the product text
    const matchedKeywords = goalWords.filter(kw => {
        if (productText.includes(kw)) return true;
        // Pure functional category synonyms (NO brand or store bias)
        if (/earphone|headphone|earbud|audio|sound|headset/i.test(kw)) {
            return /headphone|earphone|earbud|audio|sound|iem|in-ear|over-ear|wireless|anc/i.test(productText);
        }
        if (/shirt|tshirt|top|cloth|apparel/i.test(kw)) {
            return /shirt|tee|tshirt|cotton|linen|polo|apparel|top|wear/i.test(productText);
        }
        if (/ring|jewel|necklace|pendant|silver|gold/i.test(kw)) {
            return /ring|silver|gold|solitaire|jewel|zircon|pendant|necklace|band/i.test(productText);
        }
        if (/suitcase|luggage|trolley|bag|backpack|duffle|cabin/i.test(kw)) {
            return /suitcase|luggage|trolley|bag|backpack|duffle|cabin|trunk|travel/i.test(productText);
        }
        if (/guitar|piano|keyboard|ukulele|drum|violin|synth|instrument/i.test(kw)) {
            return /guitar|acoustic|electric|cutaway|strings|dreadnought|mahogany|spruce|concert|instrument/i.test(productText);
        }
        if (/shoe|sneaker|footwear/i.test(kw)) {
            return /shoe|sneaker|footwear|runner|running|trainer|slide|clog|loafers/i.test(productText);
        }
        return false;
    });
    const matchRatio = matchedKeywords.length / goalWords.length;

    if (matchRatio < 0.2 && goalWords.length >= 2) {
        return {
            aligned: false,
            matchRatio,
            goalKeywords: goalWords,
            matchedKeywords,
            reason: `Product "${product.name}" does not match user intent. Goal keywords [${goalWords.join(', ')}] not found in product. Possible agent hallucination or wrong item selected.`
        };
    }

    return {
        aligned: true,
        matchRatio,
        goalKeywords: goalWords,
        matchedKeywords,
        reason: `Product aligns with user goal (${(matchRatio * 100).toFixed(0)}% keyword match)`
    };
}

/**
 * Time window checker — IST offset = UTC+5:30
 */
function checkTimeWindow(allowedHours) {
    if (!allowedHours) return { allowed: true };

    const now = new Date();
    // Convert to IST
    const istOffset = 5.5 * 60; // minutes
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const istMinutes = (utcMinutes + istOffset) % (24 * 60);
    const istHour = Math.floor(istMinutes / 60);

    const { start, end } = allowedHours;
    if (istHour < start || istHour >= end) {
        return {
            allowed: false,
            currentHourIST: istHour,
            allowedWindow: `${start}:00 – ${end}:00 IST`,
            reason: `Purchases are only allowed between ${start}:00 and ${end}:00 IST. Current time is ${istHour}:00 IST.`
        };
    }
    return { allowed: true, currentHourIST: istHour };
}

class PolicyGate {
    constructor({
        maxTxnAmount = 5000,
        sessionSpendCap = 15000,
        maxTxnsPerSession = 10,
        allowedMerchants = ['SNAPDEAL', 'NYKAA', 'TATACLIQ', 'MEESHO', 'AMAZON'],
        blockedCategories = ['gambling', 'alcohol', 'crypto', 'gift_cards', 'adult']
    } = {}) {
        this.defaults = {
            maxTxnAmount,
            sessionSpendCap,
            maxTxnsPerSession,
            allowedMerchants,
            blockedCategories
        };
        this.velocityTracker = null; // Injected externally
    }

    injectVelocityTracker(tracker) {
        this.velocityTracker = tracker;
    }

    /**
     * Evaluates a PolicyRequest against all deterministic rules.
     * For rules requiring async (merchant trust score), accepts a pre-computed trustResult.
     */
    evaluate({
        product,
        price_at_decision,
        price_at_checkout = null,
        merchant,
        mandate = null,
        session = { current_spend: 0, txns_count: 0 },
        userGoal = null,
        merchantTrustResult = null // Pre-computed from scoreMerchantTrust()
    }) {
        const checklist = [];
        const effectiveMerchant = (merchant || product?.merchant || '').toUpperCase();
        const decisionPrice = Number(price_at_decision || product?.price || 0);
        const checkoutPrice = price_at_checkout !== null ? Number(price_at_checkout) : decisionPrice;
        const userId = mandate?.user_id || 'default';

        // ── 1. MANDATE CRYPTOGRAPHIC & EXPIRY CHECK ────────────────────────────
        let effectiveMaxTxn = this.defaults.maxTxnAmount;
        let effectiveSessionCap = this.defaults.sessionSpendCap;
        let effectiveDailyBudget = this.defaults.dailyBudget || 100000;
        let effectiveMonthlyBudget = this.defaults.monthlyBudget || 500000;
        let allowedMerchants = [...this.defaults.allowedMerchants];
        let blockedCategories = [...this.defaults.blockedCategories];
        let allowedCategories = [];
        let humanApprovalThreshold = Infinity;
        let minMerchantTrustScore = 60;
        let allowedHours = null;

        if (mandate) {
            const mandateVerification = verifyMandate(mandate);
            checklist.push({
                rule: 'MANDATE_INTEGRITY',
                passed: mandateVerification.valid,
                details: mandateVerification.valid
                    ? `Mandate ${mandate.mandate_id} verified active`
                    : `Mandate invalid (${mandateVerification.reason})`
            });

            if (!mandateVerification.valid) {
                return {
                    approved: false,
                    rule: mandateVerification.reason === 'MANDATE_EXPIRED' ? 'NO_MANDATE' : 'MANDATE_TAMPERED',
                    reason: `Purchase blocked: Spending mandate is invalid (${mandateVerification.reason}).`,
                    checklist
                };
            }

            effectiveMaxTxn = mandate.max_spend || effectiveMaxTxn;
            effectiveSessionCap = mandate.session_budget || effectiveSessionCap;
            effectiveDailyBudget = mandate.daily_budget !== undefined ? mandate.daily_budget : Math.max(100000, effectiveMaxTxn * 3);
            effectiveMonthlyBudget = mandate.monthly_budget !== undefined ? mandate.monthly_budget : Math.max(500000, effectiveMaxTxn * 10);
            humanApprovalThreshold = mandate.human_approval_threshold || Infinity;
            minMerchantTrustScore = mandate.min_merchant_trust_score ?? 60;
            allowedHours = mandate.allowed_hours || null;

            if (mandate.allowed_merchants?.length) allowedMerchants = mandate.allowed_merchants;
            if (mandate.blocked_categories?.length) blockedCategories = mandate.blocked_categories;
            if (mandate.allowed_categories?.length) allowedCategories = mandate.allowed_categories;
        } else {
            checklist.push({
                rule: 'MANDATE_INTEGRITY',
                passed: true,
                details: `Default spending parameters applied (Max ₹${effectiveMaxTxn})`
            });
        }

        // ── 2. VELOCITY CHECK ──────────────────────────────────────────────────
        if (this.velocityTracker) {
            const velocityCheck = this.velocityTracker.check();
            checklist.push({
                rule: 'VELOCITY_CHECK',
                passed: velocityCheck.allowed,
                details: velocityCheck.allowed
                    ? `Velocity OK: ${velocityCheck.stats?.attemptsLastMinute || 0}/min, ${velocityCheck.stats?.attemptsLastHour || 0}/hr`
                    : velocityCheck.reason
            });
            if (!velocityCheck.allowed) {
                return {
                    approved: false,
                    rule: velocityCheck.rule,
                    reason: velocityCheck.reason,
                    checklist
                };
            }
            this.velocityTracker.recordAttempt({ merchant: effectiveMerchant, amount: decisionPrice });
        }

        // ── 3. TIME WINDOW CHECK ───────────────────────────────────────────────
        if (allowedHours) {
            const timeCheck = checkTimeWindow(allowedHours);
            checklist.push({
                rule: 'TIME_WINDOW',
                passed: timeCheck.allowed,
                details: timeCheck.allowed
                    ? `Current time ${timeCheck.currentHourIST}:00 IST is within allowed window`
                    : timeCheck.reason
            });
            if (!timeCheck.allowed) {
                return {
                    approved: false,
                    rule: 'TIME_RESTRICTED',
                    reason: `Purchase blocked: ${timeCheck.reason}`,
                    checklist
                };
            }
        }

        // ── 4. SUBSCRIPTION / RECURRING PAYMENT DETECTION ─────────────────────
        const subscriptionCheck = detectSubscriptionSignal(product || {});
        checklist.push({
            rule: 'SUBSCRIPTION_CHECK',
            passed: !subscriptionCheck.detected,
            details: subscriptionCheck.detected
                ? `Recurring payment signal detected: "${subscriptionCheck.keyword}"`
                : `No subscription or recurring payment pattern detected`
        });
        if (subscriptionCheck.detected) {
            return {
                approved: false,
                rule: 'SUBSCRIPTION_DETECTED',
                reason: `Purchase blocked: Product appears to be a recurring subscription (keyword: "${subscriptionCheck.keyword}"). Recurring payments require explicit human authorization.`,
                checklist
            };
        }

        // ── 5. PRICE REASONABLENESS / EXTRACTION ERROR & DYNAMIC BUDGET FLOOR ──
        const priceCheck = validatePriceReasonableness(product || { name: '', price: decisionPrice, confidence: 1.0 }, userGoal);
        checklist.push({
            rule: 'PRICE_REASONABLENESS',
            passed: priceCheck.valid,
            details: priceCheck.reason + (priceCheck.expectedRange ? ` (Expected: ${priceCheck.expectedRange})` : '')
        });
        if (!priceCheck.valid) {
            return {
                approved: false,
                rule: priceCheck.rule,
                reason: `Purchase blocked: ${priceCheck.reason}`,
                checklist
            };
        }

        // ── 6. CATEGORY RESTRICTIONS ───────────────────────────────────────────
        const productCategory = (product?.category || priceCheck.category || '').toLowerCase();
        const productName = (product?.name || '').toLowerCase();

        const isBlocked = blockedCategories.some(cat =>
            productName.includes(cat) || productCategory.includes(cat)
        );
        checklist.push({
            rule: 'CATEGORY_RESTRICTION',
            passed: !isBlocked,
            details: isBlocked
                ? `Product matches blocked category: ${blockedCategories.join(', ')}`
                : `Category "${productCategory || 'general'}" is not in blocked list`
        });
        if (isBlocked) {
            return {
                approved: false,
                rule: 'CATEGORY_BLOCKED',
                reason: `Purchase blocked: Product "${product?.name}" falls under a restricted category (blocked: ${blockedCategories.join(', ')}).`,
                checklist
            };
        }

        if (allowedCategories.length > 0) {
            const isAllowed = allowedCategories.some(cat =>
                productName.includes(cat) || productCategory.includes(cat)
            );
            checklist.push({
                rule: 'CATEGORY_ALLOWLIST',
                passed: isAllowed,
                details: isAllowed
                    ? `Product matches allowed category`
                    : `Product category not in mandate allowlist: [${allowedCategories.join(', ')}]`
            });
            if (!isAllowed) {
                return {
                    approved: false,
                    rule: 'CATEGORY_NOT_ALLOWED',
                    reason: `Purchase blocked: Product category must be one of [${allowedCategories.join(', ')}]. "${product?.name}" does not match.`,
                    checklist
                };
            }
        }

        // ── 7. GOAL-PURCHASE ALIGNMENT CHECK ──────────────────────────────────
        if (userGoal) {
            const alignmentCheck = checkGoalAlignment(userGoal, product);
            checklist.push({
                rule: 'GOAL_ALIGNMENT',
                passed: alignmentCheck.aligned,
                details: alignmentCheck.reason
            });
            if (!alignmentCheck.aligned) {
                return {
                    approved: false,
                    rule: 'GOAL_MISMATCH',
                    reason: `Purchase blocked: ${alignmentCheck.reason}`,
                    checklist
                };
            }
        }

        // ── 8. DATA TRUST / PROVENANCE RULE ───────────────────────────────────
        const isFresh = product?.source !== ProvenanceSourceEnum.CACHED_SNAPSHOT;
        checklist.push({
            rule: 'DATA_FRESHNESS',
            passed: isFresh,
            details: isFresh
                ? `Fresh live data from ${product?.source}`
                : `Stale snapshot captured at ${product?.captured_at}`
        });
        if (!isFresh) {
            return {
                approved: false,
                rule: 'STALE_DATA',
                reason: `Purchase blocked: Product was extracted from a cached snapshot (${product?.captured_at}). Live price re-validation cannot run against stale data.`,
                checklist
            };
        }

        // ── 9. STOCK AVAILABILITY ──────────────────────────────────────────────
        const isExplicitOutOfStock = product?.availability === AvailabilityEnum.OUT_OF_STOCK || product?.in_stock === false || product?.availability === 'out_of_stock';
        const inStock = !isExplicitOutOfStock;
        checklist.push({
            rule: 'STOCK_AVAILABLE',
            passed: inStock,
            details: `Item status is ${inStock ? 'IN_STOCK' : (product?.availability || 'OUT_OF_STOCK')}`
        });
        if (!inStock) {
            return {
                approved: false,
                rule: 'STOCK_UNAVAILABLE',
                reason: `Purchase blocked: Item "${product?.name}" is currently marked as ${product?.availability}.`,
                checklist
            };
        }

        // ── 10. MERCHANT TRUST SCORE (Dynamic) ────────────────────────────────
        if (merchantTrustResult) {
            const trustPassed = merchantTrustResult.score >= minMerchantTrustScore;
            checklist.push({
                rule: 'MERCHANT_TRUST_SCORE',
                passed: trustPassed,
                details: `Trust Score: ${merchantTrustResult.score}/100 (threshold: ${minMerchantTrustScore}) — ${merchantTrustResult.reason}`
            });
            if (!trustPassed) {
                return {
                    approved: false,
                    rule: 'MERCHANT_UNTRUSTED',
                    reason: `Purchase blocked: ${merchantTrustResult.reason}`,
                    checklist
                };
            }
        }

        // ── 11. MERCHANT ALLOWLIST ─────────────────────────────────────────────
        const merchantAllowed = allowedMerchants.includes('*') || 
            allowedMerchants.includes(effectiveMerchant) || 
            (merchantTrustResult && merchantTrustResult.trusted && merchantTrustResult.score >= minMerchantTrustScore);

        checklist.push({
            rule: 'MERCHANT_VERIFIED',
            passed: merchantAllowed,
            details: `Merchant "${effectiveMerchant}" is ${merchantAllowed ? 'authorized' : 'not on allowlist'}`
        });
        if (!merchantAllowed) {
            return {
                approved: false,
                rule: 'MERCHANT_BLOCKED',
                reason: `Purchase blocked: Merchant "${effectiveMerchant}" is not on the authorized merchant list.`,
                checklist
            };
        }

        // ── 12. SINGLE TRANSACTION SPEND LIMIT ────────────────────────────────
        const withinTxnLimit = decisionPrice <= effectiveMaxTxn;
        checklist.push({
            rule: 'TRANSACTION_SPEND_LIMIT',
            passed: withinTxnLimit,
            details: `Price ₹${decisionPrice} ${withinTxnLimit ? '<=' : '>'} limit of ₹${effectiveMaxTxn}`
        });
        if (!withinTxnLimit) {
            return {
                approved: false,
                rule: 'PRICE_LIMIT',
                reason: `Purchase blocked: Item price of ₹${decisionPrice} exceeds the spending limit of ₹${effectiveMaxTxn}.`,
                checklist
            };
        }

        // ── 13. ROLLING DAILY & MONTHLY BUDGET ────────────────────────────────
        const spendStore = getRollingSpend(userId);
        const dailySpent = spendStore.daily.reduce((a, e) => a + e.amount, 0);
        const monthlySpent = spendStore.monthly.reduce((a, e) => a + e.amount, 0);

        const withinDaily = (dailySpent + decisionPrice) <= effectiveDailyBudget;
        const withinMonthly = (monthlySpent + decisionPrice) <= effectiveMonthlyBudget;

        checklist.push({
            rule: 'ROLLING_BUDGET',
            passed: withinDaily && withinMonthly,
            details: `Daily: ₹${dailySpent}+₹${decisionPrice}/₹${effectiveDailyBudget === Infinity ? '∞' : effectiveDailyBudget} | Monthly: ₹${monthlySpent}+₹${decisionPrice}/₹${effectiveMonthlyBudget === Infinity ? '∞' : effectiveMonthlyBudget}`
        });

        if (!withinDaily) {
            return {
                approved: false,
                rule: 'DAILY_BUDGET_EXCEEDED',
                reason: `Purchase blocked: Adding ₹${decisionPrice} would exceed daily budget. Spent today: ₹${dailySpent}/₹${effectiveDailyBudget}.`,
                checklist
            };
        }
        if (!withinMonthly) {
            return {
                approved: false,
                rule: 'MONTHLY_BUDGET_EXCEEDED',
                reason: `Purchase blocked: Adding ₹${decisionPrice} would exceed monthly budget. Spent this month: ₹${monthlySpent}/₹${effectiveMonthlyBudget}.`,
                checklist
            };
        }

        // ── 14. SESSION SPEND CAP ──────────────────────────────────────────────
        const projectedSessionSpend = (session.current_spend || 0) + decisionPrice;
        const withinSessionSpend = projectedSessionSpend <= effectiveSessionCap;
        const withinTxnCount = (session.txns_count || 0) < this.defaults.maxTxnsPerSession;

        checklist.push({
            rule: 'SESSION_BUDGET_CAP',
            passed: withinSessionSpend && withinTxnCount,
            details: `Projected session spend: ₹${projectedSessionSpend}/₹${effectiveSessionCap} (${session.txns_count || 0}/${this.defaults.maxTxnsPerSession} txns)`
        });

        if (!withinSessionSpend) {
            return {
                approved: false,
                rule: 'SESSION_SPEND_EXCEEDED',
                reason: `Purchase blocked: Total session spend of ₹${projectedSessionSpend} exceeds the session cap of ₹${effectiveSessionCap}.`,
                checklist
            };
        }
        if (!withinTxnCount) {
            return {
                approved: false,
                rule: 'SESSION_LIMIT_REACHED',
                reason: `Purchase blocked: Session transaction count limit (${this.defaults.maxTxnsPerSession}) has been reached.`,
                checklist
            };
        }

        // ── 15. LIVE PRICE INTEGRITY (Feature 5) ──────────────────────────────
        if (price_at_checkout !== null && price_at_checkout !== decisionPrice) {
            checklist.push({
                rule: 'PRICE_INTEGRITY',
                passed: false,
                details: `Price changed from ₹${decisionPrice} to ₹${checkoutPrice}`
            });
            return {
                approved: false,
                rule: 'PRICE_CHANGED',
                reason: `Purchase blocked: Live price re-validation detected price changed from ₹${decisionPrice} (at decision) to ₹${checkoutPrice} (at checkout).`,
                checklist
            };
        } else {
            checklist.push({
                rule: 'PRICE_INTEGRITY',
                passed: true,
                details: `Price re-validated: ₹${decisionPrice} matches live checkout price`
            });
        }

        // ── 16. HUMAN APPROVAL THRESHOLD ──────────────────────────────────────
        if (decisionPrice > humanApprovalThreshold) {
            checklist.push({
                rule: 'HUMAN_APPROVAL',
                passed: false,
                details: `Amount ₹${decisionPrice} exceeds human approval threshold of ₹${humanApprovalThreshold}`
            });
            return {
                approved: false,
                rule: 'HUMAN_APPROVAL_REQUIRED',
                reason: `Purchase of ₹${decisionPrice} exceeds the ₹${humanApprovalThreshold} human approval threshold. Agent must pause and request explicit human confirmation before proceeding.`,
                requiresHumanApproval: true,
                product: product,
                amount: decisionPrice,
                checklist
            };
        } else {
            checklist.push({
                rule: 'HUMAN_APPROVAL',
                passed: true,
                details: `Amount ₹${decisionPrice} is below human approval threshold (₹${humanApprovalThreshold === Infinity ? '∞' : humanApprovalThreshold})`
            });
        }

        // ── ALL RULES PASSED ───────────────────────────────────────────────────
        // Record spend against rolling budgets
        recordSpend(userId, decisionPrice);

        return {
            approved: true,
            rule: 'APPROVED',
            reason: `All ${checklist.length} policy rules passed. Transaction authorized for ₹${decisionPrice} at ${effectiveMerchant}.`,
            checklist
        };
    }
}

module.exports = {
    PolicyGate,
    checkGoalAlignment,
    checkTimeWindow,
    getRollingSpend
};
