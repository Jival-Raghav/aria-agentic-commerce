/**
 * Feature 8: Agent-Readiness Scorecard
 * Companion to README.md Section 4 (Item #8)
 * 
 * Evaluates an extracted merchant product or site on a 0-100% scale based on machine-actionability criteria.
 */

function calculateReadinessScore(extractionResult) {
    const log = extractionResult || {};
    const product = log.product || null;

    let score = 0;
    const checklist = [];
    const recommendations = [];

    // Criterion 1: Agent Standard Manifest (UCP/ACP/Shopify-MCP) - 25 points
    const hasManifest = log.step_a_manifest?.found === true;
    checklist.push({
        criterion: "Agent Manifest Support (UCP / ACP / MCP)",
        maxPoints: 25,
        awardedPoints: hasManifest ? 25 : 0,
        passed: hasManifest,
        details: hasManifest ? `Active ${log.step_a_manifest.type} manifest discovered` : "No .well-known/ucp or .well-known/acp standard manifest found"
    });
    if (hasManifest) score += 25;
    else recommendations.push("Publish a machine-readable standard manifest at /.well-known/ucp or /.well-known/acp.");

    // Criterion 2: Structured Schema.org Data - 25 points
    const hasSchemaOrg = (log.winning_step && log.winning_step.includes('schema.org')) || product?.source === 'schema_org';
    checklist.push({
        criterion: "Structured Data (schema.org/Product JSON-LD)",
        maxPoints: 25,
        awardedPoints: hasSchemaOrg ? 25 : (product ? 10 : 0),
        passed: hasSchemaOrg,
        details: hasSchemaOrg ? "Valid schema.org/Product JSON-LD markup found" : (product ? "Parsed heuristically via LLM (partial)" : "No structured schema markup found")
    });
    score += (hasSchemaOrg ? 25 : (product ? 10 : 0));
    if (!hasSchemaOrg) recommendations.push("Add standard schema.org/Product JSON-LD tags into the server-rendered HTML.");

    // Criterion 3: Direct Machine-Actionable Checkout API - 20 points
    const hasCheckoutAction = product?.checkout_action?.type === 'direct_api';
    checklist.push({
        criterion: "Machine-Actionable Checkout Action",
        maxPoints: 20,
        awardedPoints: hasCheckoutAction ? 20 : (product ? 5 : 0),
        passed: hasCheckoutAction,
        details: hasCheckoutAction ? `Direct cart API captured: ${product.checkout_action.method} ${product.checkout_action.url}` : "No direct API endpoint; browser automation click required"
    });
    score += (hasCheckoutAction ? 20 : (product ? 5 : 0));
    if (!hasCheckoutAction) recommendations.push("Expose an authenticated direct Add-to-Cart or Instant Checkout REST endpoint.");

    // Criterion 4: Unambiguous Price & Currency - 15 points
    const hasPrice = typeof product?.price === 'number' && product?.price > 0 && !!product?.currency;
    checklist.push({
        criterion: "Unambiguous Numeric Price & Currency",
        maxPoints: 15,
        awardedPoints: hasPrice ? 15 : 0,
        passed: hasPrice,
        details: hasPrice ? `Price: ₹${product.price} ${product.currency}` : "Price missing or could not be determined"
    });
    if (hasPrice) score += 15;
    else recommendations.push("Ensure product price is clearly exposed in numeric format without client-side obfuscation.");

    // Criterion 5: Real-time Stock Availability - 15 points
    const hasStock = product?.availability && product.availability !== 'unknown';
    checklist.push({
        criterion: "Real-time Stock Availability",
        maxPoints: 15,
        awardedPoints: hasStock ? 15 : 0,
        passed: hasStock,
        details: hasStock ? `Stock Status: ${product.availability}` : "Stock status is unknown or ambiguous"
    });
    if (hasStock) score += 15;
    else recommendations.push("Expose explicit in_stock / out_of_stock inventory status in metadata.");

    // Determine Grade
    let grade = 'F';
    if (score >= 90) grade = 'A+';
    else if (score >= 80) grade = 'A';
    else if (score >= 65) grade = 'B';
    else if (score >= 50) grade = 'C';
    else if (score >= 35) grade = 'D';

    return {
        merchant: log.merchant || product?.merchant || 'UNKNOWN',
        score,
        maxScore: 100,
        grade,
        isAgentReady: score >= 65,
        checklist,
        recommendations
    };
}

module.exports = {
    calculateReadinessScore
};
