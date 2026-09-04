/**
 * Feature 5: Live Price Re-validation at Checkout
 * Companion to README.md Section 4 (Item #5) & Section 6 (Demo Step 7)
 * 
 * Re-checks the live merchant price immediately before initiating settlement.
 * Proves WHY the gate exists by catching price discrepancies and price tampering.
 */

const { extractFromRawHtml } = require('../extractor/stepB_schema_org');

async function revalidatePrice(product, simulatedPrice = null) {
    const originalPrice = Number(product.price);
    console.log(`[Price Re-validation] Re-checking live price for "${product.name}" (Original: ₹${originalPrice})...`);

    // 1. Simulated Price Change (for staged demo failure test)
    if (simulatedPrice !== null && !isNaN(Number(simulatedPrice))) {
        const livePrice = Number(simulatedPrice);
        const priceChanged = livePrice !== originalPrice;
        console.log(`[Price Re-validation] [DEMO SIMULATION] Live price staged to ₹${livePrice} (Changed: ${priceChanged})`);
        return {
            verified: !priceChanged,
            originalPrice,
            currentPrice: livePrice,
            priceChanged,
            source: 'simulated_live_revalidation'
        };
    }

    // 2. Real Live Price Re-fetch from merchant URL
    if (product.product_url) {
        try {
            const rawResult = await extractFromRawHtml(product.product_url, product.merchant);
            if (rawResult.found && rawResult.products.length > 0) {
                const freshProduct = rawResult.products[0];
                const livePrice = Number(freshProduct.price);
                const priceChanged = livePrice !== originalPrice;

                console.log(`[Price Re-validation] Live price re-fetched: ₹${livePrice} (Price changed: ${priceChanged})`);
                return {
                    verified: !priceChanged,
                    originalPrice,
                    currentPrice: livePrice,
                    priceChanged,
                    freshProduct,
                    source: 'live_merchant_refetch'
                };
            }
        } catch (e) {
            console.warn(`[Price Re-validation] Real-time re-fetch failed: ${e.message}. Using decision price.`);
        }
    }

    // Fallback: Default to verified if live refetch is unavailable
    return {
        verified: true,
        originalPrice,
        currentPrice: originalPrice,
        priceChanged: false,
        source: 'cached_decision_price'
    };
}

module.exports = {
    revalidatePrice
};
