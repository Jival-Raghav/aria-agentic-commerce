/**
 * Step B3 — CDP Network Interception Extractor
 * Layer D1 in the Universal Extractor Cascade
 * 
 * Intercepts internal XHR/Fetch API responses fired during SPA page load.
 * Many JavaScript SPAs (Tata CLiQ, Ajio, Vue/Angular/React storefronts)
 * request clean product JSON from backend endpoints (e.g. /api/products/..., /gateway/item/...)
 * before rendering.
 */

const { createProductRecord, AvailabilityEnum, ProvenanceSourceEnum } = require('../catalog/schema');
const { findProductInState } = require('./stepB2_embedded_json');

class NetworkInterceptor {
    constructor(pageClient) {
        this.pageClient = pageClient;
        this.jsonResponses = [];
        this.pendingRequests = new Map();
        this.isListening = false;
    }

    /**
     * Start intercepting network responses
     */
    async start() {
        if (this.isListening) return;
        this.isListening = true;

        this.pageClient.on('Network.responseReceived', async (params) => {
            try {
                const { requestId, response } = params;
                const mime = (response?.mimeType || '').toLowerCase();
                const url = (response?.url || '').toLowerCase();

                // Exclude tracking / analytics / telemetry
                if (/analytics|doubleclick|google|facebook|segment|datadog|clarity/i.test(url)) {
                    return;
                }

                // Check if JSON response or API endpoint
                if (mime.includes('json') || url.includes('/api/') || url.includes('/gateway') || url.includes('/pdp') || url.includes('/product')) {
                    this.pendingRequests.set(requestId, {
                        url: response.url,
                        status: response.status,
                        mimeType: response.mimeType
                    });
                }
            } catch (e) {}
        });

        this.pageClient.on('Network.loadingFinished', async (params) => {
            const { requestId } = params;
            if (this.pendingRequests.has(requestId)) {
                const reqMeta = this.pendingRequests.get(requestId);
                this.pendingRequests.delete(requestId);

                try {
                    const bodyRes = await this.pageClient.send('Network.getResponseBody', { requestId });
                    if (bodyRes && bodyRes.body) {
                        const raw = bodyRes.base64Encoded
                            ? Buffer.from(bodyRes.body, 'base64').toString('utf8')
                            : bodyRes.body;

                        try {
                            const parsed = JSON.parse(raw);
                            this.jsonResponses.push({
                                url: reqMeta.url,
                                data: parsed
                            });
                        } catch (e) {}
                    }
                } catch (e) {
                    // Responses for redirects or cancelled streams can error, safe to ignore
                }
            }
        });
    }

    /**
     * Extracts product from intercepted API payloads
     */
    extractProduct(productUrl, merchant) {
        if (!this.jsonResponses || this.jsonResponses.length === 0) {
            return { found: false, product: null, count: 0 };
        }

        // Rank responses by relevance to product details
        for (const item of this.jsonResponses) {
            const candidate = findProductInState(item.data);
            if (candidate && candidate.name && candidate.price) {
                const product = createProductRecord({
                    id: `${merchant}_api_intercept_${Date.now()}`,
                    name: candidate.name,
                    description: candidate.description || `Extracted via SPA Network API (${item.url})`,
                    price: candidate.price,
                    currency: candidate.currency || 'INR',
                    availability: candidate.availability || AvailabilityEnum.IN_STOCK,
                    variants: candidate.variants || [],
                    product_url: productUrl,
                    merchant: merchant,
                    source: ProvenanceSourceEnum.LLM_EXTRACTED,
                    confidence: 0.92
                });

                return {
                    found: true,
                    apiUrl: item.url,
                    product
                };
            }
        }

        return { found: false, product: null, count: this.jsonResponses.length };
    }
}

module.exports = {
    NetworkInterceptor
};
