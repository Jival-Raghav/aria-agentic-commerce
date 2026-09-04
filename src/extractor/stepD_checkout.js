/**
 * Step D — Checkout Signal Fingerprinting & Action Capture
 * Companion to Universal Extractor Architecture
 * 
 * Strategy:
 * 1. Primary: Dynamic CTA exploration with Network & DOM Fingerprinting
 *    - Direct Cart API (e.g. POST /cart, POST /gateway-api/cartapi/...)
 *    - Razorpay Native (merchant embeds Razorpay Checkout.js directly)
 *    - Form Redirect (navigation to /cart or /checkout)
 *    - Browser Automation Required (DOM mutation / drawer without public API)
 * 2. Fallback: Domain Recipe Execution (modal dismissals + merchant-specific selectors)
 */

const fs = require('fs');
const path = require('path');

function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function loadDomainRecipe(domain) {
    const cleanDomain = domain.replace(/^www\./, '').toLowerCase();
    const recipePath = path.join(__dirname, '..', 'recipes', `${cleanDomain.split('.')[0]}.json`);
    if (fs.existsSync(recipePath)) {
        try {
            return JSON.parse(fs.readFileSync(recipePath, 'utf8'));
        } catch (e) {}
    }
    return null;
}

function isMerchantCartRequest(req, domain) {
    if (!req || !req.url) return false;
    const url = req.url.toLowerCase();

    // Exclude analytics, tracking, ads, and telemetry
    const ignoredHosts = [
        'google.', 'doubleclick.', 'facebook.', 'analytics.', 'pinterest.',
        'criteo.', 'clarity.', 'hotjar.', 'segment.', 'datadog.', 'sentry.'
    ];
    for (const ign of ignoredHosts) {
        if (url.includes(ign)) return false;
    }

    const isCartUrl = /cart|bag|checkout|item\/add|orders|basket|buy/i.test(url);
    const isActionMethod = req.method === 'POST' || req.method === 'PUT';

    return isCartUrl && isActionMethod;
}

function isRazorpayRequest(req) {
    if (!req || !req.url) return false;
    const url = req.url.toLowerCase();
    return url.includes('razorpay.com') || url.includes('rzp.io');
}

/**
 * Fingerprints page state after CTA interaction
 */
async function fingerprintPageState(pageClient) {
    try {
        const evalRes = await pageClient.send('Runtime.evaluate', {
            expression: `
                (() => {
                    const hasRazorpayGlobal = typeof window.Razorpay !== 'undefined';
                    const hasRazorpayIframe = Array.from(document.querySelectorAll('iframe')).some(f => (f.src || '').includes('razorpay'));
                    
                    // Check if cart count badge exists and is > 0
                    const badges = Array.from(document.querySelectorAll('.cart-count, .bag-count, [data-cart-count], .badge, .cart-item-count'));
                    let cartCount = null;
                    for (const b of badges) {
                        const num = parseInt(b.innerText || b.textContent || '', 10);
                        if (!isNaN(num) && num > 0) {
                            cartCount = num;
                            break;
                        }
                    }

                    // Check for active drawer, modal, or toast
                    const hasCartDrawer = Array.from(document.querySelectorAll('[class*="cart-drawer"], [class*="mini-cart"], [class*="cart-slide"], [role="dialog"]')).some(el => {
                        const rect = el.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none';
                    });

                    return {
                        hasRazorpayGlobal,
                        hasRazorpayIframe,
                        cartCount,
                        hasCartDrawer,
                        currentUrl: window.location.href
                    };
                })()
            `,
            returnByValue: true
        });

        return evalRes.result?.value || {};
    } catch (e) {
        return {};
    }
}

/**
 * Executes Step D on an active CDP Page Client with Signal Fingerprinting
 */
async function captureCheckoutAction(pageClient, domain, netLogs = []) {
    console.log(`[Step D] Attempting zero-configuration checkout fingerprinting for: ${domain}...`);

    // 1. Primary: Dynamic CTA scan and click
    const dynamicResult = await pageClient.send('Runtime.evaluate', {
        expression: `
            (() => {
                const allButtons = Array.from(document.querySelectorAll('button, a, div[role="button"], span, input[type="submit"], input[type="button"]'));
                const visible = allButtons.filter(el => {
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
                });

                const cta = visible.find(b => {
                    const txt = (b.innerText || b.value || b.getAttribute('aria-label') || '').toLowerCase().trim();
                    return (
                        txt === 'add to cart' ||
                        txt === 'add to bag' ||
                        txt.includes('add to cart') ||
                        txt.includes('add to bag') ||
                        txt === 'buy now' ||
                        txt.includes('buy now') ||
                        txt.includes('order now')
                    );
                });

                if (cta) {
                    cta.scrollIntoView({ behavior: 'instant', block: 'center' });
                    cta.click();
                    return { success: true, text: (cta.innerText || cta.value || '').trim() };
                }

                return { success: false, reason: 'No visible CTA button found dynamically' };
            })()
        `,
        returnByValue: true
    });

    await delay(3500);

    // Analyze post-click fingerprint
    const pageState = await fingerprintPageState(pageClient);

    // Fingerprint Signal 1: Razorpay Native Checkout
    const rzpRequest = netLogs.find(r => isRazorpayRequest(r));
    if (rzpRequest || pageState.hasRazorpayGlobal || pageState.hasRazorpayIframe) {
        console.log(`[Step D] Fingerprint: RAZORPAY_NATIVE detected!`);
        return {
            captured: true,
            strategy: 'checkout_fingerprinting',
            fingerprint: 'RAZORPAY_NATIVE',
            action: {
                type: 'razorpay_native',
                method: rzpRequest ? rzpRequest.method : 'SDK_TRIGGER',
                url: rzpRequest ? rzpRequest.url : 'https://api.razorpay.com/v1/checkout/embedded',
                payload: rzpRequest?.postData || null,
                button_selector: dynamicResult.result?.value?.text || 'buy_now_btn'
            }
        };
    }

    // Fingerprint Signal 2: Direct Cart API
    let cartRequest = netLogs.find(r => isMerchantCartRequest(r, domain));
    if (cartRequest && dynamicResult.result?.value?.success) {
        console.log(`[Step D] Fingerprint: DIRECT_CART_API detected (${cartRequest.method} ${cartRequest.url})`);
        return {
            captured: true,
            strategy: 'checkout_fingerprinting',
            fingerprint: 'DIRECT_CART_API',
            action: {
                type: 'direct_api',
                method: cartRequest.method,
                url: cartRequest.url,
                payload: cartRequest.postData || null,
                button_selector: dynamicResult.result.value.text
            }
        };
    }

    // Fingerprint Signal 3: Form / Navigation Redirect
    if (pageState.currentUrl && (/cart|checkout|bag/i.test(pageState.currentUrl) && !pageState.currentUrl.includes('/product/'))) {
        console.log(`[Step D] Fingerprint: FORM_REDIRECT detected -> ${pageState.currentUrl}`);
        return {
            captured: true,
            strategy: 'checkout_fingerprinting',
            fingerprint: 'FORM_REDIRECT',
            action: {
                type: 'form_redirect',
                method: 'GET',
                url: pageState.currentUrl,
                payload: null,
                button_selector: dynamicResult.result?.value?.text || 'cta'
            }
        };
    }

    // Fingerprint Signal 4: DOM Mutation / Drawer without standalone public REST endpoint
    if (pageState.hasCartDrawer || (pageState.cartCount !== null && pageState.cartCount > 0)) {
        console.log(`[Step D] Fingerprint: BROWSER_AUTOMATION (DOM drawer open / badge incremented)`);
        return {
            captured: true,
            strategy: 'checkout_fingerprinting',
            fingerprint: 'BROWSER_AUTOMATION',
            action: {
                type: 'browser_automation',
                method: 'DOM_CLICK',
                url: pageState.currentUrl,
                payload: { cartCount: pageState.cartCount, drawerOpen: pageState.hasCartDrawer },
                button_selector: dynamicResult.result?.value?.text || 'add_to_cart'
            }
        };
    }

    // 2. Fallback: Domain Recipe Execution
    console.log(`[Step D] Dynamic fingerprinting inconclusive. Trying domain recipe fallback for ${domain}...`);
    const recipe = loadDomainRecipe(domain);

    if (recipe) {
        console.log(`[Step D] Found recipe for ${domain}: executing pre-actions & selectors...`);

        // Execute pre-actions (e.g. modal dismissals)
        if (recipe.preActions && Array.isArray(recipe.preActions)) {
            for (const pre of recipe.preActions) {
                if (pre.type === 'dismiss_modal') {
                    await pageClient.send('Runtime.evaluate', {
                        expression: `
                            (() => {
                                const modals = Array.from(document.querySelectorAll('button, span, div, a'));
                                for (const m of modals) {
                                    const t = (m.innerText || '').toLowerCase().trim();
                                    if (t === 'no, thanks' || t === 'dismiss' || t === 'close' || t === 'x' || t === 'not now') {
                                        m.click();
                                        break;
                                    }
                                }
                            })()
                        `
                    });
                    await delay(1000);
                }
            }
        }

        // Click recipe selectors
        const recipeClick = await pageClient.send('Runtime.evaluate', {
            expression: `
                (() => {
                    const selectors = ${JSON.stringify(recipe.ctaSelectors || [])};
                    for (const sel of selectors) {
                        try {
                            const el = document.querySelector(sel);
                            if (el) {
                                el.scrollIntoView({ behavior: 'instant', block: 'center' });
                                el.click();
                                return { success: true, selector: sel };
                            }
                        } catch (e) {}
                    }
                    return { success: false, reason: 'Recipe selectors not found on page' };
                })()
            `,
            returnByValue: true
        });

        await delay(3500);

        cartRequest = netLogs.find(r => isMerchantCartRequest(r, domain));

        if (cartRequest) {
            console.log(`[Step D] Recipe capture SUCCEEDED: ${cartRequest.method} ${cartRequest.url}`);
            return {
                captured: true,
                strategy: 'domain_recipe_fallback',
                fingerprint: 'DIRECT_CART_API',
                action: {
                    type: 'direct_api',
                    method: cartRequest.method,
                    url: cartRequest.url,
                    payload: cartRequest.postData || null,
                    button_selector: recipeClick.result?.value?.selector || 'recipe_selector'
                }
            };
        }
    }

    console.log(`[Step D] Checkout action could not be captured.`);
    return {
        captured: false,
        strategy: 'failed',
        fingerprint: 'UNKNOWN',
        reason: dynamicResult.result?.value?.reason || 'No cart API or checkout trigger recognized'
    };
}

module.exports = {
    captureCheckoutAction,
    loadDomainRecipe,
    fingerprintPageState
};
