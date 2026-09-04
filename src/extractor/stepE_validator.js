/**
 * Step E — Validation Layer
 * Companion to extractor-implementation-plan.md Step E
 * Enforces strict catalog contracts before any record touches the Unified Catalog.
 */

const { AvailabilityEnum, ProvenanceSourceEnum } = require('../catalog/schema');

function validateProduct(product) {
    const errors = [];

    if (!product || typeof product !== 'object') {
        return {
            isValid: false,
            errors: ['Product record is null or not an object'],
            product: null
        };
    }

    // 1. Name validation & Denylist Check
    if (!product.name || typeof product.name !== 'string' || product.name.trim().length < 3) {
        errors.push('Product name must be a non-empty string of at least 3 characters');
    } else {
        const lowerName = product.name.toLowerCase().trim();
        const TITLE_DENYLIST = [
            '404', 'not found', 'page not found', 'we can\'t find', 'could not find',
            'access denied', 'robot check', 'security check', 'just a moment',
            'attention required', 'shop now', 'online store', 'home page', 'default title',
            'undefined', 'null', 'unknown product', 'item not available'
        ];
        if (TITLE_DENYLIST.some(d => lowerName.includes(d))) {
            errors.push(`Product name '${product.name}' contains denylisted error/placeholder phrase`);
        }
        if (/^(products|shop|store|online|buy|home|category|collection)$/i.test(lowerName)) {
            errors.push(`Product name '${product.name}' is a generic site tag, not a specific product`);
        }
    }

    // 2. Price validation
    const numPrice = Number(product.price);
    if (isNaN(numPrice) || numPrice <= 0) {
        errors.push(`Product price must be a numeric value > 0, received: ${product.price}`);
    }

    // 3. Currency validation
    const validCurrencies = ['INR', 'USD', 'EUR', 'GBP'];
    const currency = (product.currency || 'INR').toUpperCase();
    if (!validCurrencies.includes(currency)) {
        errors.push(`Currency '${product.currency}' is not in allowed set: ${validCurrencies.join(', ')}`);
    }

    // 4. Availability validation
    if (!Object.values(AvailabilityEnum).includes(product.availability)) {
        errors.push(`Availability '${product.availability}' is invalid. Allowed: ${Object.values(AvailabilityEnum).join(', ')}`);
    }

    // 5. Source provenance validation
    if (!Object.values(ProvenanceSourceEnum).includes(product.source)) {
        errors.push(`Source '${product.source}' is invalid. Allowed: ${Object.values(ProvenanceSourceEnum).join(', ')}`);
    }

    // 6. Confidence validation
    const conf = Number(product.confidence);
    if (isNaN(conf) || conf < 0 || conf > 1) {
        errors.push(`Confidence must be a number between 0 and 1, received: ${product.confidence}`);
    }

    // 7. URL validation
    if (!product.product_url || typeof product.product_url !== 'string' || !product.product_url.startsWith('http')) {
        errors.push(`Invalid product_url: ${product.product_url}`);
    }

    if (errors.length > 0) {
        return {
            isValid: false,
            errors,
            product
        };
    }

    return {
        isValid: true,
        errors: [],
        product: {
            ...product,
            price: numPrice,
            currency,
            confidence: conf
        }
    };
}

module.exports = {
    validateProduct
};
