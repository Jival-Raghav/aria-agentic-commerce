/**
 * Master Extractor Cascade (Enhanced Universal Zero-Configuration Architecture)
 * Companion to README.md Section 4 & Universal Extractor layers
 * 
 * Pipeline:
 * Layer A:  Manifests (UCP / ACP / Shopify MCP)
 * Layer B:  Schema.org JSON-LD (Raw HTML)
 * Layer C:  Embedded JSON State (__NEXT_DATA__, __INITIAL_STATE__, Shopify meta)
 * Headless CDP:
 *   Layer B:  Schema.org JSON-LD (Rendered DOM)
 *   Layer D1: SPA Network API Interception
 *   Layer D2: CSS Pattern Library (WooCommerce, Shopify, Magento, Indian D2C)
 *   Layer E:  LLM DOM Text -> LLM Vision Screenshot (Nuclear fallback) -> Heuristic
 * Step D:   Checkout Signal Fingerprinting (Direct API / Razorpay Native / Form Redirect / Browser)
 * Step E:   Schema Contract Validation
 */

const { spawn } = require('child_process');
const http = require('http');
const { checkManifests } = require('./stepA_manifest');
const { extractFromRawHtml, extractFromRenderedDom } = require('./stepB_schema_org');
const { extractFromEmbeddedJsonState } = require('./stepB2_embedded_json');
const { NetworkInterceptor } = require('./stepB3_network_intercept');
const { extractWithDomPatterns } = require('./stepC_dom_patterns');
const { extractWithLlm } = require('./stepC_llm');
const { captureCheckoutAction } = require('./stepD_checkout');
const { validateProduct } = require('./stepE_validator');
const { ProvenanceSourceEnum } = require('../catalog/schema');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const CDP_PORT = 9222;

function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}

class CDPClient {
    constructor(wsUrl) {
        this.wsUrl = wsUrl;
        this.ws = null;
        this.id = 1;
        this.callbacks = new Map();
        this.eventListeners = new Map();
    }
    async connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.wsUrl);
            this.ws.onopen = () => resolve();
            this.ws.onerror = (e) => reject(e);
            this.ws.onmessage = (msg) => {
                const data = JSON.parse(msg.data);
                if (data.id && this.callbacks.has(data.id)) {
                    const cb = this.callbacks.get(data.id);
                    this.callbacks.delete(data.id);
                    if (data.error) cb.reject(data.error);
                    else cb.resolve(data.result);
                } else if (data.method) {
                    const listeners = this.eventListeners.get(data.method) || [];
                    for (const l of listeners) l(data.params);
                }
            };
        });
    }
    send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const reqId = this.id++;
            this.callbacks.set(reqId, { resolve, reject });
            this.ws.send(JSON.stringify({ id: reqId, method, params }));
        });
    }
    on(event, handler) {
        if (!this.eventListeners.has(event)) this.eventListeners.set(event, []);
        this.eventListeners.get(event).push(handler);
    }
    close() {
        if (this.ws) {
            try { this.ws.close(); } catch (e) {}
        }
    }
}

async function getDebuggerUrl() {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${CDP_PORT}/json/version`, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data).webSocketDebuggerUrl); } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
    });
}

async function startChrome() {
    const tempDir = `C:\\Users\\jival\\AppData\\Local\\Temp\\chrome_cascade_${Date.now()}`;
    const chrome = spawn(CHROME_PATH, [
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${tempDir}`,
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1280,800',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ], { stdio: 'ignore' });

    for (let i = 0; i < 20; i++) {
        await delay(500);
        try {
            const url = await getDebuggerUrl();
            if (url) return { chrome, tempDir, browserWs: url };
        } catch (e) {}
    }
    throw new Error('Chrome failed to start or open CDP port');
}

class ExtractorCascade {
    constructor() {
        this.browserProcess = null;
        this.browserClient = null;
    }

    async init() {
        if (!this.browserClient) {
            const { chrome, browserWs } = await startChrome();
            this.browserProcess = chrome;
            this.browserClient = new CDPClient(browserWs);
            await this.browserClient.connect();
        }
    }

    async close() {
        if (this.browserClient) {
            try { this.browserClient.close(); } catch (e) {}
        }
        if (this.browserProcess) {
            try { this.browserProcess.kill(); } catch (e) {}
        }
        this.browserClient = null;
        this.browserProcess = null;
    }

    /**
     * Extracts a merchant product page through the enhanced universal cascade
     */
    async extract(productUrl, options = {}) {
        const startTime = Date.now();
        const urlObj = new URL(productUrl);
        const domain = urlObj.hostname.replace(/^www\./, '');
        const merchant = domain.split('.')[0].toUpperCase();

        const log = {
            url: productUrl,
            domain,
            merchant,
            step_a_manifest: null,
            step_b_schema_org_raw: null,
            step_b2_embedded_json_raw: null,
            step_b_schema_org_rendered: null,
            step_b3_network_intercept: null,
            step_c_dom_patterns: null,
            step_c_llm: null,
            step_d_checkout_action: null,
            step_e_validation: null,
            winning_step: null,
            product: null,
            status: 'FAILED',
            error: null,
            duration_ms: 0
        };

        console.log(`\n======================================================`);
        console.log(`[CASCADE] Starting extraction for: ${productUrl}`);
        console.log(`======================================================`);

        // --- LAYER A: Manifest Check ---
        console.log(`[Step A] Checking manifests on domain ${domain}...`);
        const manifestResult = await checkManifests(domain);
        log.step_a_manifest = manifestResult;

        if (manifestResult.found) {
            console.log(`[Step A] HIT! Found active manifest: ${manifestResult.type}`);
            log.winning_step = 'Step A (Manifest)';
            log.status = 'DISQUALIFIED_ALREADY_AGENTIC';
            log.duration_ms = Date.now() - startTime;
            return log;
        }

        // --- LAYER B: Schema.org (Raw HTML Fetch) ---
        console.log(`[Step B] Fetching raw HTML for schema.org JSON-LD...`);
        const rawHtmlResult = await extractFromRawHtml(productUrl, merchant);
        log.step_b_schema_org_raw = rawHtmlResult;

        let candidateProduct = null;
        if (rawHtmlResult.found && rawHtmlResult.products.length > 0) {
            console.log(`[Step B] HIT (Raw HTML)! Extracted: "${rawHtmlResult.products[0].name}" @ ₹${rawHtmlResult.products[0].price}`);
            candidateProduct = rawHtmlResult.products[0];
            log.winning_step = 'Step B (schema.org Raw HTML)';
        }

        // --- LAYER C: Embedded JSON State (Raw HTML) ---
        if (!candidateProduct && rawHtmlResult.rawHtml) {
            console.log(`[Step B2] Inspecting raw HTML for embedded JSON state (__NEXT_DATA__, __STATE__)...`);
            const embeddedResult = extractFromEmbeddedJsonState(rawHtmlResult.rawHtml, productUrl, merchant);
            log.step_b2_embedded_json_raw = embeddedResult;

            if (embeddedResult.found && embeddedResult.products.length > 0) {
                console.log(`[Step B2] HIT (Embedded JSON State)! Extracted: "${embeddedResult.products[0].name}" @ ₹${embeddedResult.products[0].price}`);
                candidateProduct = embeddedResult.products[0];
                log.winning_step = 'Step B2 (Embedded JSON State)';
            }
        }

        // Fast-path: If candidateProduct already found via Step B or B2 with valid price, validate and return immediately!
        if (candidateProduct && candidateProduct.price && candidateProduct.name) {
            const validation = validateProduct(candidateProduct);
            log.step_e_validation = validation;
            if (validation.isValid) {
                log.product = validation.product;
                log.status = 'SUCCESS';
                log.duration_ms = Date.now() - startTime;
                console.log(`[CASCADE FAST-PATH] Instant success via ${log.winning_step} in ${log.duration_ms}ms!`);
                return log;
            }
        }

        // --- HEADLESS CDP SESSION (For Rendered DOM, SPA Intercept, Patterns, LLM/Vision & Checkout) ---
        await this.init();
        const { targetId } = await this.browserClient.send('Target.createTarget', { url: 'about:blank' });
        const pages = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
        const targetPage = pages.find(p => p.id === targetId);

        let pageClient = null;
        const netLogs = [];
        let interceptor = null;

        try {
            pageClient = new CDPClient(targetPage.webSocketDebuggerUrl);
            await pageClient.connect();
            await pageClient.send('Page.enable');
            await pageClient.send('Network.enable');

            // Hook CDP Network Interceptor for SPA internal APIs
            interceptor = new NetworkInterceptor(pageClient);
            await interceptor.start();

            pageClient.on('Network.requestWillBeSent', (p) => {
                if (p.request) netLogs.push(p.request);
            });

            console.log(`[Headless Navigation] Navigating to: ${productUrl}...`);
            await pageClient.send('Page.navigate', { url: productUrl });
            await delay(2500);

            // Evaluate page state (Check WAF/Bot block)
            const pageState = await pageClient.send('Runtime.evaluate', {
                expression: `
                    ({
                        title: document.title,
                        bodySnippet: document.body ? document.body.innerText.slice(0, 300) : '',
                        outerHtml: document.documentElement.outerHTML
                    })
                `,
                returnByValue: true
            });

            const state = pageState.result?.value || {};

            // Explicit Bot / WAF Detection (NO fake fallback)
            if (state.title && (state.title.includes('Access Denied') || state.bodySnippet.includes('Access Denied'))) {
                console.warn(`[CASCADE ERROR] Access Denied by WAF on ${domain}`);
                log.status = 'BLOCKED_BY_WAF';
                log.error = `Akamai/WAF bot challenge blocked headless navigation (Title: "${state.title}")`;
                log.duration_ms = Date.now() - startTime;
                return log;
            }

            // --- LAYER B (Rendered DOM schema.org) ---
            if (!candidateProduct) {
                console.log(`[Step B] Inspecting rendered DOM for hydrated schema.org JSON-LD...`);
                const renderedSchemaResult = extractFromRenderedDom(state.outerHtml, productUrl, merchant);
                log.step_b_schema_org_rendered = renderedSchemaResult;

                if (renderedSchemaResult.found && renderedSchemaResult.products.length > 0) {
                    console.log(`[Step B] HIT (Rendered DOM)! Extracted: "${renderedSchemaResult.products[0].name}" @ ₹${renderedSchemaResult.products[0].price}`);
                    candidateProduct = renderedSchemaResult.products[0];
                    log.winning_step = 'Step B (schema.org Rendered DOM)';
                }
            }

            // --- LAYER D1 (SPA Network Interception) ---
            if (!candidateProduct && interceptor) {
                console.log(`[Step B3] Inspecting intercepted SPA internal API responses...`);
                const interceptRes = interceptor.extractProduct(productUrl, merchant);
                log.step_b3_network_intercept = interceptRes;

                if (interceptRes.found && interceptRes.product) {
                    console.log(`[Step B3] HIT (SPA API Intercept)! Extracted: "${interceptRes.product.name}" @ ₹${interceptRes.product.price}`);
                    candidateProduct = interceptRes.product;
                    log.winning_step = 'Step B3 (SPA Network Intercept)';
                }
            }

            // --- LAYER D2 (CSS Pattern Library) ---
            if (!candidateProduct) {
                console.log(`[Step C1] Running CSS DOM Pattern Library across standard e-commerce patterns...`);
                const patternRes = await extractWithDomPatterns(pageClient, productUrl, merchant);
                log.step_c_dom_patterns = patternRes;

                if (patternRes.found && patternRes.product) {
                    console.log(`[Step C1] HIT (CSS Pattern Library)! Extracted: "${patternRes.product.name}" @ ₹${patternRes.product.price}`);
                    candidateProduct = patternRes.product;
                    log.winning_step = 'Step C1 (CSS Pattern Library)';
                }
            }

            // --- LAYER E (LLM Text + Vision Screenshot Fallback) ---
            if (!candidateProduct) {
                console.log(`[Step C2] Invoking Step C (LLM / Vision Extractor)...`);
                const llmResult = await extractWithLlm({
                    domHtml: state.outerHtml,
                    productUrl,
                    merchant,
                    pageClient
                });
                log.step_c_llm = llmResult;

                if (llmResult.success && llmResult.product) {
                    console.log(`[Step C2] HIT (${llmResult.method})! "${llmResult.product.name}" @ ₹${llmResult.product.price}`);
                    candidateProduct = llmResult.product;
                    log.winning_step = `Step C2 (${llmResult.method})`;
                } else {
                    console.warn(`[Step C2] Extraction failed: ${llmResult.error}`);
                }
            }

            // --- STEP D (Checkout Signal Fingerprinting) ---
            if (candidateProduct) {
                console.log(`[Step D] Fingerprinting checkout signals...`);
                netLogs.length = 0; // reset logs before action
                const checkoutActionRes = await captureCheckoutAction(pageClient, domain, netLogs);
                log.step_d_checkout_action = checkoutActionRes;

                if (checkoutActionRes.captured) {
                    candidateProduct.checkout_action = checkoutActionRes.action;
                    candidateProduct.confidence = Math.min(1.0, candidateProduct.confidence + 0.05);
                } else {
                    candidateProduct.checkout_action = null;
                }
            }

        } catch (navErr) {
            console.error(`[CASCADE ERROR] Browser error: ${navErr.message}`);
            log.error = `Browser navigation error: ${navErr.message}`;
        } finally {
            if (pageClient) {
                try { pageClient.close(); } catch (e) {}
            }
            if (this.browserClient && targetId) {
                try { await this.browserClient.send('Target.closeTarget', { targetId }); } catch (e) {}
            }
        }

        // --- STEP E: Validation Layer ---
        if (candidateProduct) {
            console.log(`[Step E] Validating candidate product against schema contract...`);
            const validation = validateProduct(candidateProduct);
            log.step_e_validation = validation;

            if (validation.isValid) {
                log.product = validation.product;
                log.status = 'SUCCESS';
                console.log(`[CASCADE SUCCESS] Extraction complete via ${log.winning_step}!`);
            } else {
                log.status = 'VALIDATION_FAILED';
                log.error = `Product validation errors: ${validation.errors.join('; ')}`;
                console.warn(`[CASCADE VALIDATION ERROR] ${log.error}`);
            }
        } else if (!log.error) {
            log.status = 'NO_PRODUCT_FOUND';
            log.error = 'All extraction steps failed to discover product data on this page';
        }

        log.duration_ms = Date.now() - startTime;
        return log;
    }
}

module.exports = {
    ExtractorCascade
};
