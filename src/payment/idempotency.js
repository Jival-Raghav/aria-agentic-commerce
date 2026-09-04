/**
 * Feature 10: Idempotency & Replay Protection
 * Companion to README.md Section 4 (Item #10)
 * 
 * Prevents double-firing Razorpay orders on retry, network blip, or accidental duplicate agent clicks.
 * Tracks idempotency keys with cryptographic hashes and execution state.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class IdempotencyManager {
    constructor(storagePath = null) {
        const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NODE_ENV === 'production');
        this.storagePath = storagePath || (isServerless ? path.join(require('os').tmpdir(), 'idempotency_store.json') : path.join(__dirname, '..', '..', 'audit_logs', 'idempotency_store.json'));
        this.store = new Map();
        this.initStorage();
    }

    initStorage() {
        try {
            if (this.storagePath && fs.existsSync(this.storagePath)) {
                const data = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
                for (const [k, v] of Object.entries(data)) {
                    this.store.set(k, v);
                }
            }
        } catch (e) {
            this.store = new Map();
        }
    }

    persist() {
        try {
            if (!this.storagePath) return;
            const dir = path.dirname(this.storagePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            const obj = {};
            for (const [k, v] of this.store.entries()) {
                obj[k] = v;
            }
            fs.writeFileSync(this.storagePath, JSON.stringify(obj, null, 2));
        } catch (e) {
            // In serverless / read-only systems, in-memory store continues seamlessly
        }
    }

    /**
     * Computes an idempotency key from transaction parameters + purchase intent nonce.
     * Including intentId ensures legitimate separate purchases of the same product
     * receive distinct keys, while retries of the SAME intent safely replay.
     */
    generateKey({ mandateId = 'default', intentId = null, productId, amount, customKey = null }) {
        if (customKey) return customKey;
        const nonce = intentId || `intent_${Date.now()}`;
        const raw = `${mandateId}:${nonce}:${productId}:${Number(amount).toFixed(2)}`;
        return 'idemp_' + crypto.createHash('sha256').update(raw).digest('hex').substring(0, 24);
    }

    /**
     * Executes an action with idempotency protection
     */
    async execute({ key, actionFn }) {
        if (!key) {
            throw new Error('Idempotency key is required');
        }

        // Check if already executed
        if (this.store.has(key)) {
            const existing = this.store.get(key);
            console.log(`[Idempotency] HIT! Returning existing cached result for key: ${key}`);
            return {
                replayed: true,
                idempotencyKey: key,
                originalTimestamp: existing.timestamp,
                result: existing.result
            };
        }

        // Execute action
        console.log(`[Idempotency] MISS. Executing fresh action for key: ${key}`);
        const result = await actionFn();

        // Store result
        const record = {
            idempotencyKey: key,
            timestamp: new Date().toISOString(),
            result
        };
        this.store.set(key, record);
        this.persist();

        return {
            replayed: false,
            idempotencyKey: key,
            originalTimestamp: record.timestamp,
            result
        };
    }

    get(key) {
        return this.store.get(key) || null;
    }

    clear() {
        this.store.clear();
        this.persist();
    }
}

module.exports = {
    IdempotencyManager
};
