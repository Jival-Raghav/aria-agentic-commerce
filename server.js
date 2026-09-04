/**
 * Universal Agentic Commerce Core Spine + Tier 2 Enhancements
 * 
 * Open-Web Multi-Store Search & Cross-Site Comparison Engine
 * Zero-Click Autonomous Execution with Cascading Policy Gate Fallbacks
 */

const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');

const { ExtractorCascade } = require('./src/extractor/cascade');
const { UnifiedCatalog } = require('./src/catalog/catalog');
const { ShoppingAgent } = require('./src/agent/shopping_agent');
const { PolicyGate } = require('./src/gate/policy_gate');
const { extractBudgetFromGoal } = require('./src/gate/price_reasonableness');
const { createSpendingMandate } = require('./src/gate/spending_mandate');
const { revalidatePrice } = require('./src/gate/price_revalidator');
const { scoreMerchantTrust } = require('./src/gate/merchant_trust');
const { RazorpayClient } = require('./src/payment/razorpay_client');
const { IdempotencyManager } = require('./src/payment/idempotency');
const { AuditTrail } = require('./src/audit/audit_trail');
const { calculateReadinessScore } = require('./src/eval/readiness_score');

const PORT = process.env.PORT || 3000;

// Initialize Core Engine
const cascade = new ExtractorCascade();
const catalog = new UnifiedCatalog();
const agent = new ShoppingAgent(catalog);
const policyGate = new PolicyGate();
const razorpay = new RazorpayClient();
const idempotencyManager = new IdempotencyManager();
const auditTrail = new AuditTrail();
const pendingApprovals = new Map();

/**
 * Execute Autonomous Policy Gate & Razorpay Settlement Pipeline
 */
async function executeAutonomousPurchase({ proposal, userGoal, simulatedPrice, mandate, attemptId = null }) {
    const product = proposal.product;
    const priceRevalidation = await revalidatePrice(product, simulatedPrice);
    
    let merchantDomain = 'unknown.com';
    try {
        merchantDomain = product.product_url ? new URL(product.product_url).hostname.replace(/^www\./, '') : product.merchant.toLowerCase() + '.com';
    } catch (e) {
        merchantDomain = product.merchant.toLowerCase() + '.com';
    }

    const merchantTrustResult = await scoreMerchantTrust(merchantDomain, product.product_url);
    
    // Auto-create mandate from userGoal if not explicitly passed
    let activeMandateObj = null;
    if (mandate) {
        activeMandateObj = createSpendingMandate(mandate);
    } else if (userGoal) {
        const goalBudget = extractBudgetFromGoal(userGoal);
        if (goalBudget) {
            activeMandateObj = createSpendingMandate({ max_spend: goalBudget, session_budget: goalBudget * 2 });
        }
    }

    const gateDecision = policyGate.evaluate({
        product,
        price_at_decision: proposal.price_at_decision,
        price_at_checkout: priceRevalidation.currentPrice,
        merchant: product.merchant,
        mandate: activeMandateObj,
        userGoal: userGoal || proposal.userGoal || null,
        merchantTrustResult
    });

    if (!gateDecision.approved) {
        const auditEntry = auditTrail.record({
            userGoal: userGoal || '',
            agentProposal: proposal,
            gateDecision,
            priceRevalidation,
            razorpayOrder: null,
            settlement: null
        });
        return {
            approved: false,
            gateDecision,
            priceRevalidation,
            proposal,
            auditEntry
        };
    }

    // Use caller-provided attemptId for retries, or generate fresh attemptNonce for distinct purchases
    const attemptNonce = attemptId || `attempt_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const idempKey = idempotencyManager.generateKey({
        mandateId: activeMandateObj?.mandate_id,
        intentId: `intent_${product.id}_${proposal.price_at_decision}_${attemptNonce}`,
        productId: product.id,
        amount: priceRevalidation.currentPrice
    });

    const idempExec = await idempotencyManager.execute({
        key: idempKey,
        actionFn: async () => {
            const order = await razorpay.createOrder({
                amount: priceRevalidation.currentPrice,
                receipt: idempKey,
                notes: {
                    productId: product.id,
                    merchant: product.merchant,
                    userGoal: userGoal || ''
                }
            });
            const settle = razorpay.settleTestPayment({
                orderId: order.orderId,
                amount: order.amount
            });
            return { order, settle };
        }
    });

    const auditEntry = auditTrail.record({
        userGoal: userGoal || '',
        agentProposal: proposal,
        gateDecision,
        priceRevalidation,
        razorpayOrder: idempExec.result.order,
        settlement: idempExec.result.settle
    });

    return {
        approved: true,
        gateDecision,
        priceRevalidation,
        razorpayOrder: idempExec.result.order,
        settlement: idempExec.result.settle,
        idempotency: {
            idempotencyKey: idempKey,
            replayed: idempExec.replayed,
            timestamp: idempExec.originalTimestamp
        },
        auditEntry,
        proposal
    };
}

const PUBLIC_DIR = path.join(__dirname, 'public');

function serveHtmlFile(res, filename) {
    try {
        let filePath = path.join(PUBLIC_DIR, filename);
        if (!fs.existsSync(filePath)) {
            filePath = path.join(process.cwd(), 'public', filename);
        }
        if (!fs.existsSync(filePath)) {
            filePath = path.join(process.cwd(), filename);
        }
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end(content);
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`Error loading ${filename}: File not found`);
    } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Error loading ${filename}: ${e.message}`);
    }
}

function parseBody(req) {
    return new Promise((resolve) => {
        if (req.body && typeof req.body === 'object') {
            return resolve(req.body);
        }
        if (typeof req.body === 'string') {
            try { return resolve(JSON.parse(req.body)); } catch (e) { return resolve({}); }
        }
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(body || '{}')); }
            catch (e) { resolve({}); }
        });
    });
}

async function requestHandler(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Serve static assets (logo, images)
    if (pathname === '/aria-logo.png') {
        try {
            let imgPath = path.join(PUBLIC_DIR, 'aria-logo.png');
            if (!fs.existsSync(imgPath)) {
                imgPath = path.join(process.cwd(), 'public', 'aria-logo.png');
            }
            if (!fs.existsSync(imgPath)) {
                imgPath = path.join(process.cwd(), 'aria-logo.png');
            }
            if (fs.existsSync(imgPath)) {
                const imgData = fs.readFileSync(imgPath);
                res.writeHead(200, { 'Content-Type': 'image/png' });
                return res.end(imgData);
            }
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Logo not found');
        } catch (e) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Logo not found');
        }
        return;
    }

    // Serve Production Consumer UI
    if (pathname === '/' || pathname === '/index.html') {
        serveHtmlFile(res, 'index.html');
        return;
    }

    // Serve Developer Diagnostic & Test Console
    if (pathname === '/test' || pathname === '/dev' || pathname === '/test.html') {
        serveHtmlFile(res, 'test.html');
        return;
    }

    // API: Live Extractor URL Inspection
    if (pathname === '/api/extractor/inspect-url' && req.method === 'POST') {
        const body = await parseBody(req);
        const targetUrl = body.url || '';
        if (!targetUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ERROR', error: 'Missing target URL' }));
            return;
        }

        try {
            const extractLog = await cascade.extract(targetUrl);
            if (extractLog.product) {
                extractLog.readinessScore = calculateReadinessScore({
                    merchant: extractLog.product.merchant,
                    winning_step: extractLog.winning_step,
                    product: extractLog.product
                });
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(extractLog));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'FAILED', error: err.message }));
        }
        return;
    }

    // API: Autonomous Search, Cross-Store Compare & Zero-Click Settlement
    if (pathname === '/api/agent/search-and-shop' && req.method === 'POST') {
        const body = await parseBody(req);
        const goal = body.goal || '';
        const mandate = body.mandate || null;
        const selectedEngine = body.searchEngine || 'both';

        try {
            const decision = await agent.searchAndShop(goal, cascade, { searchEngine: selectedEngine });
            if (!decision.success || !decision.proposal) {
                auditTrail.record({
                    userGoal: goal,
                    agentProposal: null,
                    gateDecision: {
                        approved: false,
                        rule: 'NO_IN_BUDGET_CANDIDATES',
                        reason: decision.reason || 'No candidates found within budget.',
                        checklist: []
                    },
                    priceRevalidation: null,
                    razorpayOrder: null,
                    settlement: null
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(decision));
                return;
            }

            // Zero-Click Autonomous Execution on Top Pick
            let purchaseResult = await executeAutonomousPurchase({
                proposal: decision.proposal,
                userGoal: goal,
                mandate,
                attemptId: body.attemptId || null
            });

            // Cascading Fallback: If Top Pick failed Policy Gate (e.g. price floor/stock), auto-evaluate ALL alternatives!
            if (!purchaseResult.approved && decision.proposal.alternatives && decision.proposal.alternatives.length > 0) {
                const fallbackTimeline = [
                    {
                        attempt: 1,
                        merchant: decision.proposal.product.merchant,
                        productName: decision.proposal.product.name,
                        price: decision.proposal.price_at_decision,
                        status: 'BLOCKED',
                        rule: purchaseResult.gateDecision?.rule || 'POLICY_REJECT',
                        reason: purchaseResult.gateDecision?.reason || 'Failed policy verification'
                    }
                ];

                for (let i = 0; i < decision.proposal.alternatives.length; i++) {
                    const alt = decision.proposal.alternatives[i];
                    const altProposal = {
                        product: alt,
                        price_at_decision: alt.price,
                        merchant: alt.merchant,
                        reasoning: `Auto-healed fallback from ${decision.proposal.product.merchant}: Switched to ${alt.name} at ₹${alt.price} from ${alt.merchant}.`,
                        decision_trace: [
                            ...decision.proposal.decision_trace,
                            `Candidate on ${decision.proposal.product.merchant} failed Policy Gate (${purchaseResult.gateDecision?.rule}). Auto-falling back to next verified store: ${alt.merchant}...`
                        ]
                    };

                    const altPurchase = await executeAutonomousPurchase({
                        proposal: altProposal,
                        userGoal: goal,
                        mandate,
                        attemptId: body.attemptId ? `${body.attemptId}_fallback_${alt.merchant}` : null
                    });

                    if (altPurchase.approved) {
                        fallbackTimeline.push({
                            attempt: i + 2,
                            merchant: alt.merchant,
                            productName: alt.name,
                            price: alt.price,
                            status: 'APPROVED',
                            orderId: altPurchase.razorpayOrder?.orderId
                        });

                        purchaseResult = {
                            ...altPurchase,
                            healedFromFallback: true,
                            previousBlockedMerchant: decision.proposal.product.merchant,
                            previousBlockRule: purchaseResult.gateDecision?.rule,
                            fallbackTimeline
                        };
                        break; // Successfully auto-healed!
                    } else {
                        fallbackTimeline.push({
                            attempt: i + 2,
                            merchant: alt.merchant,
                            productName: alt.name,
                            price: alt.price,
                            status: 'BLOCKED',
                            rule: altPurchase.gateDecision?.rule || 'POLICY_REJECT',
                            reason: altPurchase.gateDecision?.reason || 'Failed policy verification'
                        });
                        purchaseResult.fallbackTimeline = fallbackTimeline;
                    }
                }
            }

            const chosenProduct = purchaseResult.proposal?.product || decision.proposal.product;
            const auditPhases = {
                phase1_intent: {
                    goal,
                    searchQuery: decision.parsedIntent?.searchQuery || goal,
                    category: decision.parsedIntent?.category || 'general',
                    maxPrice: decision.parsedIntent?.maxPrice === Infinity ? 'Unlimited' : decision.parsedIntent?.maxPrice,
                    minPrice: decision.parsedIntent?.minPrice || 0,
                    isAccessory: decision.parsedIntent?.isAccessory || false,
                    targetProduct: decision.parsedIntent?.targetProduct || goal
                },
                phase2_discovery: {
                    engine: selectedEngine,
                    candidateCount: decision.candidateUrls?.length || decision.proposal?.comparisonMatrix?.length || 0,
                    candidateUrls: (decision.candidateUrls || []).map(u => typeof u === 'string' ? u : u.product_url || u.name)
                },
                phase3_extraction: {
                    extractedCount: decision.extractedCount || decision.proposal?.comparisonMatrix?.length || 0,
                    stores: (decision.proposal?.comparisonMatrix || []).map(c => ({
                        merchant: c.merchant,
                        name: c.name,
                        price: c.price,
                        source: c.product?.source || 'schema_org',
                        confidence: c.product?.confidence || 0.95
                    }))
                },
                phase4_comparison: decision.proposal.comparisonMatrix || [],
                phase5_policy: purchaseResult.gateDecision?.checklist || [],
                phase6_settlement: purchaseResult.settlement ? {
                    orderId: purchaseResult.razorpayOrder?.orderId,
                    paymentId: purchaseResult.settlement?.paymentId,
                    amount: purchaseResult.razorpayOrder?.amount,
                    currency: purchaseResult.razorpayOrder?.currency || 'INR',
                    signatureVerified: purchaseResult.settlement?.signatureVerified,
                    receipt: purchaseResult.razorpayOrder?.receipt
                } : null
            };

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                proposal: purchaseResult.proposal || decision.proposal,
                comparisonMatrix: decision.proposal.comparisonMatrix || [],
                purchaseResult,
                auditPhases,
                decision_trace: decision.proposal.decision_trace
            }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, reason: err.message, decision_trace: [err.message] }));
        }
        return;
    }

    // API: Manual / Step-by-Step Policy Gate Checkout
    if (pathname === '/api/gate/checkout' && req.method === 'POST') {
        const body = await parseBody(req);
        const { userGoal, proposal, simulatedPrice, mandate } = body;

        try {
            const purchaseResult = await executeAutonomousPurchase({
                proposal,
                userGoal,
                simulatedPrice,
                mandate
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(purchaseResult));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // API: Audit Trail Logs
    if (pathname === '/api/audit/logs' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(auditTrail.getAll()));
        return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint Not Found' }));
}

const server = http.createServer(requestHandler);

if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`\n================================================================`);
        console.log(`🚀 AGENTIC COMMERCE ENGINE LIVE: http://localhost:${PORT}`);
        console.log(`================================================================\n`);
    });
}

module.exports = requestHandler;
