/**
 * Feature 7: Audit Trail (Append-Only Readable Decision Trace)
 * Companion to README.md Section 4 (Item #7)
 * 
 * Records every step of an AI-initiated money action:
 * User Request -> Live Search -> Agent Proposal -> Policy Gate -> Live Re-validation -> Razorpay Order -> Settlement
 * Outputs both structured JSON and a human-readable trace.
 */

const fs = require('fs');
const path = require('path');

class AuditTrail {
    constructor(logFilePath = null) {
        this.records = [];
        this.logFilePath = logFilePath || path.join(__dirname, '..', '..', 'audit_logs', 'audit_trail.json');
        this.initStorage();
    }

    initStorage() {
        const dir = path.dirname(this.logFilePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (fs.existsSync(this.logFilePath)) {
            try {
                this.records = JSON.parse(fs.readFileSync(this.logFilePath, 'utf8'));
            } catch (e) {
                this.records = [];
            }
        }
    }

    /**
     * Records a complete transaction decision lifecycle
     */
    record({
        userGoal,
        agentProposal,
        gateDecision,
        priceRevalidation = null,
        razorpayOrder = null,
        settlement = null
    }) {
        const txId = `txn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const timestamp = new Date().toISOString();

        // Construct human-readable trace
        const traceLines = [
            `================================================================================`,
            `DECISION AUDIT TRACE: ${txId} (${timestamp})`,
            `================================================================================`,
            `1. USER REQUEST:`,
            `   Goal: "${userGoal}"`,
            ``,
            `2. AI SHOPPING AGENT DECISION:`,
            `   Selected: "${agentProposal?.product?.name}" from ${agentProposal?.product?.merchant}`,
            `   Price at Decision: ₹${agentProposal?.price_at_decision}`,
            `   Data Provenance: ${agentProposal?.product?.source} (Confidence: ${(agentProposal?.product?.confidence * 100).toFixed(0)}%)`,
            `   Reasoning: ${agentProposal?.reasoning}`,
            ``,
            `3. DETERMINISTIC POLICY GATE EVALUATION:`,
            `   Status: ${gateDecision?.approved ? 'APPROVED' : 'BLOCKED'} (Rule: ${gateDecision?.rule})`,
            `   Reason: ${gateDecision?.reason}`,
            `   Checklist:`,
            ...(gateDecision?.checklist || []).map(c => `     [${c.passed ? '✓ PASS' : '✗ FAIL'}] ${c.rule}: ${c.details}`),
            ``
        ];

        if (priceRevalidation) {
            traceLines.push(
                `4. LIVE PRICE RE-VALIDATION AT CHECKOUT:`,
                `   Price at Decision: ₹${priceRevalidation.originalPrice}`,
                `   Price at Checkout: ₹${priceRevalidation.currentPrice}`,
                `   Integrity Verified: ${priceRevalidation.verified ? 'YES (No Price Drift)' : 'FAILED (Price Changed)'}`,
                ``
            );
        }

        if (razorpayOrder) {
            traceLines.push(
                `5. RAZORPAY TEST-MODE SETTLEMENT:`,
                `   Order ID: ${razorpayOrder.orderId || 'N/A'} (Status: ${razorpayOrder.status})`,
                `   Amount: ₹${razorpayOrder.amount} (${razorpayOrder.amountInPaise} paise)`,
                `   Receipt: ${razorpayOrder.receipt}`,
                `   Payment ID: ${settlement?.paymentId || 'N/A'}`,
                `   HMAC Signature Verified: ${settlement?.signatureVerified ? 'YES' : 'NO'}`,
                ``
            );
        }

        traceLines.push(
            `FINAL OUTCOME: ${razorpayOrder?.success && settlement?.settled ? 'PAYMENT SETTLED ON RAZORPAY' : (gateDecision?.approved ? 'APPROVED BY GATE' : 'BLOCKED BY POLICY GATE')}`,
            `================================================================================\n`
        );

        const humanReadableTrace = traceLines.join('\n');

        const entry = {
            transactionId: txId,
            timestamp,
            userGoal,
            agentProposal,
            gateDecision,
            priceRevalidation,
            razorpayOrder,
            settlement,
            humanReadableTrace
        };

        this.records.unshift(entry); // Prepend to top

        // Persist to file
        try {
            fs.writeFileSync(this.logFilePath, JSON.stringify(this.records, null, 2));
        } catch (e) {
            console.error('[AuditTrail] Failed to write log file:', e.message);
        }

        return entry;
    }

    getAll() {
        return this.records;
    }

    getById(txId) {
        return this.records.find(r => r.transactionId === txId) || null;
    }
}

module.exports = {
    AuditTrail
};
