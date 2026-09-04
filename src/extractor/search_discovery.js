/**
 * Structured Search Discovery Module (API Adapter + D2C Native APIs)
 * 
 * Provides 100% reliable, CAPTCHA-free multi-store discovery:
 * 1. Structured Search API Adapter (Google Custom Search, SerpAPI, Brave Search)
 * 2. Native D2C Predictive Search APIs (Shopify & Custom APIs across boAt, HeadphoneZone, Snitch, GIVA, Mokobara, HUFT, Snapdeal)
 * 3. Fallback Open Search Provider with PDP link classification
 */

const https = require('https');
const http = require('http');
const querystring = require('querystring');
const config = require('../config');

function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function fetchJson(url, options = {}) {
    return new Promise((resolve) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                ...options.headers
            }
        }, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (e) { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(6000, () => { req.destroy(); resolve(null); });
    });
}

async function fetchHttp(targetUrl) {
    return new Promise((resolve) => {
        const client = targetUrl.startsWith('https') ? https : http;
        const req = client.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        }, (res) => {
            if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307) && res.headers.location) {
                let redirectUrl = res.headers.location;
                if (!redirectUrl.startsWith('http')) {
                    redirectUrl = new URL(redirectUrl, targetUrl).href;
                }
                return fetchHttp(redirectUrl).then(resolve);
            }
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', (err) => resolve({ status: null, body: '', error: err.message }));
        req.setTimeout(6000, () => { req.destroy(); resolve({ status: 'TIMEOUT', body: '' }); });
    });
}

const SEARCH_CACHE = new Map();

function cleanPdpUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    try {
        let unescaped = rawUrl.replace(/\\u003d/gi, '=').replace(/\\u0026/gi, '&').replace(/\\u002f/gi, '/');
        
        // Handle Google redirect URLs like https://www.google.com/url?url=https://...
        if (unescaped.includes('google.') && (unescaped.includes('/url?') || unescaped.includes('url=') || unescaped.includes('q='))) {
            try {
                const parsedGoogle = new URL(unescaped);
                const inner = parsedGoogle.searchParams.get('url') || parsedGoogle.searchParams.get('q');
                if (inner && inner.startsWith('http')) {
                    unescaped = inner;
                }
            } catch (e) {}
        }

        const u = new URL(unescaped);
        u.searchParams.delete('srsltid');
        u.searchParams.delete('utm_source');
        u.searchParams.delete('utm_medium');
        u.searchParams.delete('utm_campaign');
        u.searchParams.delete('gclid');
        u.searchParams.delete('fbclid');
        return u.origin + u.pathname;
    } catch (e) {
        return rawUrl.split('?')[0];
    }
}

function isPdpUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return false;
    try {
        const clean = cleanPdpUrl(rawUrl);
        const parsed = new URL(clean);
        const host = parsed.hostname.toLowerCase();
        const path = parsed.pathname.toLowerCase();

        const BLOCKED_DOMAINS = [
            'google.com', 'bing.com', 'duckduckgo.com', 'youtube.com',
            'wikipedia.org', 'quora.com', 'reddit.com', 'smartprix.com',
            '91mobiles.com', 'choicely.in', 'facebook.com', 'instagram.com',
            'twitter.com', 'linkedin.com', 'pinterest.com', 'gadgets360.com',
            'gadgetsnow.com', 'mysmartprice.com', 'digit.in', 'ndtv.com',
            'indiatimes.com', 'pricebaba.com', 'cashify.in'
        ];
        if (BLOCKED_DOMAINS.some(d => host.endsWith(d) || host.includes(d))) return false;

        const BLOCKED_PATHS = [
            '/category/', '/categories/', '/tag/', '/tags/',
            '/blog/', '/blogs/', '/news/', '/reviews/', '/review/', '/article/',
            '/articles/', '/best-', '/top-10', '/search', '/deals/', '/deals',
            '/musical-instruments/', '/acoustic-guitars.html', '/guitars-bass/',
            '-store', '/store/', '/list-of-', '/price-list', '/filters/',
            '-group', '/computers-tablets/', '/laptops/', '/c/', '/b?'
        ];
        if (BLOCKED_PATHS.some(p => path.includes(p))) return false;

        const PDP_PATTERNS = [
            /\/products\/[a-zA-Z0-9_\-]+/i,
            /\/product\/[a-zA-Z0-9_\-]+/i,
            /\/item\/[a-zA-Z0-9_\-]+/i,
            /\/goods\/[a-zA-Z0-9_\-]+/i,
            /\/p\/[a-zA-Z0-9_\-]+/i,
            /\/dp\/[a-zA-Z0-9_\-]+/i,
            /\/[a-zA-Z0-9_\-]+\/p\/[a-zA-Z0-9_\-]+/i,
            /\/[a-zA-Z0-9_\-]+\/dp\/[a-zA-Z0-9_\-]+/i,
            /\/p-mp[0-9]+/i,
            /\/p-[a-zA-Z0-9_\-]+/i,
            /\/[0-9]+\/buy/i,
            /\/pn\/[a-zA-Z0-9_\-]+/i,
            /\/prn\/[a-zA-Z0-9_\-]+/i,
            /\/[a-zA-Z0-9_\-]{8,}\.html$/i
        ];
        return PDP_PATTERNS.some(pat => pat.test(path));
    } catch (e) {
        return false;
    }
}

async function resolveShopifyCollection(colUrl, maxItems = 6) {
    try {
        const u = new URL(colUrl);
        const colPath = u.pathname.replace(/\/+$/, '');
        const jsonUrl = `https://${u.hostname}${colPath}/products.json?limit=15`;
        const data = await fetchJson(jsonUrl);
        if (data && Array.isArray(data.products)) {
            const inStock = data.products.filter(p => p.variants?.[0]?.available !== false);
            inStock.sort((a, b) => (parseFloat(b.variants?.[0]?.price) || 0) - (parseFloat(a.variants?.[0]?.price) || 0));
            return inStock.slice(0, maxItems).map(p => ({
                title: p.title,
                price: parseFloat(p.variants?.[0]?.price) || null,
                url: `https://${u.hostname}/products/${p.handle}`,
                merchant: u.hostname.replace(/^www\./, '').split('.')[0]
            }));
        }
    } catch (e) {}
    return [];
}

/**
 * Resolves exact Product Detail Page (PDP) for a candidate across Indian merchants
 */
async function resolveDirectStorePdp(merchantName, title, organicResults = []) {
    const mClean = (merchantName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // 1. Match against already-fetched Google Organic results (0ms latency!)
    if (Array.isArray(organicResults) && organicResults.length > 0) {
        for (const r of organicResults) {
            const link = r.link || r.url;
            if (link && isPdpUrl(link)) {
                try {
                    const host = new URL(link).hostname.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (host.includes(mClean) || (mClean.length > 3 && mClean.includes(host.replace(/^(www|com|in|co)/g, '')))) {
                        return cleanPdpUrl(link);
                    }
                } catch (e) {}
            }
        }
    }

    // 2. Direct Marketplace search fallback (Flipkart / Amazon)
    try {
        const m = (merchantName || '').toLowerCase();
        const q = encodeURIComponent(title);
        
        if (m.includes('flipkart')) {
            const res = await fetchHttp(`https://www.flipkart.com/search?q=${q}`);
            if (res.status === 200 && res.body) {
                const re = /href=["'](\/[a-zA-Z0-9_\-]+\/p\/[a-zA-Z0-9_\-]+[^"']*)["']/gi;
                let match = re.exec(res.body);
                if (match) {
                    return 'https://www.flipkart.com' + match[1].split('?')[0];
                }
            }
        } else if (m.includes('amazon')) {
            const res = await fetchHttp(`https://www.amazon.in/s?k=${q}`);
            if (res.status === 200 && res.body) {
                const re = /href=["'](\/[a-zA-Z0-9_\-]+\/dp\/[a-zA-Z0-9_\-]+[^"']*)["']/gi;
                let match = re.exec(res.body);
                if (match) {
                    return 'https://www.amazon.in' + match[1].split('?')[0];
                }
            }
        }
    } catch (e) {}

    // 3. Query Tavily AI targeted PDP search
    const tavilyKey = process.env.TAVILY_API_KEY || config.TAVILY_API_KEY;
    if (tavilyKey) {
        try {
            const query = `${merchantName} ${title} buy online India`;
            const postPayload = JSON.stringify({
                api_key: tavilyKey,
                query: query,
                search_depth: 'basic',
                max_results: 5
            });
            const tavilyRes = await new Promise((resolve) => {
                const req = https.request('https://api.tavily.com/search', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postPayload)
                    }
                }, (res) => {
                    let b = '';
                    res.on('data', c => b += c);
                    res.on('end', () => {
                        try { resolve(JSON.parse(b)); } catch(e) { resolve(null); }
                    });
                });
                req.on('error', () => resolve(null));
                req.setTimeout(4000, () => { req.destroy(); resolve(null); });
                req.write(postPayload);
                req.end();
            });

            const results = tavilyRes?.results || [];
            // Prefer exact domain match
            for (const r of results) {
                if (r.url && isPdpUrl(r.url)) {
                    const h = new URL(r.url).hostname.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (h.includes(mClean) || (mClean.length > 3 && mClean.includes(h.replace(/^(www|com|in|co)/g, '')))) {
                        return cleanPdpUrl(r.url);
                    }
                }
            }
            // Fallback to first valid PDP
            for (const r of results) {
                if (r.url && isPdpUrl(r.url)) {
                    return cleanPdpUrl(r.url);
                }
            }
        } catch (e) {}
    }

    return null;
}

/**
 * Builds accurate store URL for merchants without deceptive cross-store redirects
 */
function buildMerchantStoreUrl(merchantName, title, rawLink, productLink) {
    if (rawLink && !rawLink.includes('google.com') && !rawLink.includes('googleadservices') && isPdpUrl(rawLink)) {
        return cleanPdpUrl(rawLink);
    }
    const q = encodeURIComponent(title);
    const m = (merchantName || '').toLowerCase().trim();
    if (m.includes('flipkart')) return `https://www.flipkart.com/search?q=${q}`;
    if (m.includes('amazon')) return `https://www.amazon.in/s?k=${q}`;
    if (m.includes('croma')) return `https://www.croma.com/searchB?q=${q}`;
    if (m.includes('reliance') || m.includes('reliancedigital')) return `https://www.reliancedigital.in/search?q=${q}`;
    if (m.includes('jiomart')) return `https://www.jiomart.com/search/${q}`;
    if (m.includes('snapdeal')) return `https://www.snapdeal.com/search?keyword=${q}`;
    if (m.includes('tatacliq') || m.includes('tata')) return `https://www.tatacliq.com/search/?searchCategory=all&text=${q}`;
    if (m.includes('myntra')) return `https://www.myntra.com/${q.replace(/%20/g, '-')}`;
    if (m.includes('nykaa')) return `https://www.nykaa.com/search/result/?q=${q}`;
    if (m.includes('bigbasket')) return `https://www.bigbasket.com/ps/?q=${q}`;
    if (m.includes('bajaao')) return `https://www.bajaao.com/search?q=${q}`;
    if (m.includes('oneplus')) return `https://www.oneplus.in/store/search?keyword=${q}`;
    if (m.includes('samsung')) return `https://www.samsung.com/in/search/?searchvalue=${q}`;
    if (m.includes('tapwell')) return `https://tapwell.in/search?q=${q}`;
    if (m.includes('gonoise') || m.includes('noise')) return `https://www.gonoise.com/search?q=${q}`;
    if (m.includes('boat')) return `https://www.boat-lifestyle.com/search?q=${q}`;
    if (m.includes('decathlon')) return `https://www.decathlon.in/search?query=${q}`;
    if (m.includes('wholemonkey')) return `https://wholemonkey.com/search?q=${q}`;

    if (productLink && !productLink.includes('googleadservices')) {
        return productLink;
    }

    const cleanStore = (merchantName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanStore && cleanStore.length > 2) {
        return `https://www.google.com/search?q=site%3A${cleanStore}.in+${q}`;
    }
    return `https://www.google.com/search?q=${q}+buy+online+India`;
}

/**
 * 1. Structured Search API Adapter (SerpAPI, Google Custom Search, Brave, Tavily)
 */
async function searchStructuredApi(query, maxResults = 5, targetMerchant = null, searchEngine = 'auto') {
    const cacheKey = `search_${query.toLowerCase().trim()}_${targetMerchant || 'all'}_${searchEngine}`;
    if (SEARCH_CACHE.has(cacheKey)) {
        console.log(`[Search API] Cache HIT for query: "${query}" (${searchEngine})`);
        return SEARCH_CACHE.get(cacheKey);
    }

    const serpApiKey = process.env.SERPAPI_KEY || process.env.SERPAPI_API_KEY || config.SERPAPI_KEY;
    const googleKey = process.env.GOOGLE_SEARCH_API_KEY || config.GOOGLE_SEARCH_API_KEY;
    const googleCx = process.env.GOOGLE_SEARCH_CX || process.env.GOOGLE_CX || config.GOOGLE_SEARCH_CX;
    const braveKey = process.env.BRAVE_SEARCH_API_KEY || config.BRAVE_SEARCH_API_KEY;
    const tavilyKey = process.env.TAVILY_API_KEY || config.TAVILY_API_KEY;

async function fetchTavilyCandidates(query, tavilyKey) {
    try {
        console.log(`[Search API] Querying Tavily AI Search with: "${query}"`);
        const postPayload = JSON.stringify({
            api_key: tavilyKey,
            query: `${query} buy online India`,
            search_depth: 'basic',
            include_domains: [],
            max_results: 10
        });
        const tavilyRes = await new Promise((resolve) => {
            const req = https.request('https://api.tavily.com/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postPayload)
                }
            }, (res) => {
                let b = '';
                res.on('data', c => b += c);
                res.on('end', () => {
                    try { resolve(JSON.parse(b)); } catch(e) { resolve(null); }
                });
            });
            req.on('error', () => resolve(null));
            req.write(postPayload);
            req.end();
        });

        const results = tavilyRes?.results || [];
        const urls = [];
        const storeDomainsToProbe = new Set();

        for (const r of results) {
            const cleaned = cleanPdpUrl(r.url);
            if (cleaned && isPdpUrl(cleaned) && !urls.includes(cleaned)) {
                urls.push(cleaned);
            } else if (cleaned && cleaned.includes('/collections/')) {
                try {
                    const colProducts = await resolveShopifyCollection(cleaned, 4);
                    for (const cp of colProducts) {
                        if (cp.url && isPdpUrl(cp.url) && !urls.includes(cp.url)) {
                            urls.push(cp.url);
                        }
                    }
                } catch(e) {}
            }

            if (r.url) {
                try {
                    const d = new URL(r.url).hostname;
                    if (!d.includes('google') && !d.includes('amazon') && !d.includes('flipkart') && !d.includes('youtube')) {
                        storeDomainsToProbe.add(d);
                    }
                } catch(e) {}
            }
        }

        if (storeDomainsToProbe.size > 0) {
            for (const domain of Array.from(storeDomainsToProbe).slice(0, 4)) {
                try {
                    const d2cItems = await searchShopifyD2C(domain, query, 2);
                    for (const item of d2cItems) {
                        if (item.url && isPdpUrl(item.url) && !urls.includes(item.url)) {
                            urls.push(item.url);
                        }
                    }
                } catch(e) {}
            }
        }

        return urls;
    } catch (e) {
        console.warn(`[Search API] Tavily error: ${e.message}`);
        return [];
    }
}

async function fetchSerpApiCandidates(query, serpApiKey, targetMerchant = null) {
    try {
        console.log(`[Search API] Querying SerpAPI Google Shopping for: "${query}"`);
        const shoppingUrl = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(query)}&api_key=${serpApiKey}&gl=in`;
        const searchUrl = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query + ' price India')}&api_key=${serpApiKey}&gl=in&num=10`;
        
        const [shopData, organicData] = await Promise.all([
            fetchJson(shoppingUrl),
            fetchJson(searchUrl)
        ]);

        const urls = [];
        const storeDomainsToProbe = new Set();

        if (shopData?.shopping_results) {
            let sortedShopping = [...shopData.shopping_results];
            if (targetMerchant) {
                const tm = targetMerchant.toLowerCase();
                sortedShopping.sort((a, b) => {
                    const aMatch = (a.source || '').toLowerCase().includes(tm) ? -1 : 1;
                    const bMatch = (b.source || '').toLowerCase().includes(tm) ? -1 : 1;
                    return aMatch - bMatch;
                });
            }
            const topShopping = sortedShopping.slice(0, 6);
            const resolvePromises = topShopping.map(async (s) => {
                if (s.extracted_price && s.title) {
                    const mName = (s.source || 'Online Store').replace(/\.in|\.com/gi, '').toUpperCase();
                    let directStoreUrl = buildMerchantStoreUrl(mName, s.title, s.link, s.product_link);
                    
                    try {
                        const exactPdp = await resolveDirectStorePdp(mName, s.title, organicData?.organic_results || []);
                        if (exactPdp) {
                            directStoreUrl = exactPdp;
                        }
                    } catch (e) {}

                    return {
                        id: `SHOP_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                        name: s.title,
                        price: s.extracted_price,
                        merchant: mName,
                        product_url: directStoreUrl,
                        in_stock: true,
                        source: 'serpapi_shopping',
                        confidence: 0.95
                    };
                }
                return null;
            });

            const resolvedItems = await Promise.all(resolvePromises);
            for (const item of resolvedItems) {
                if (item) urls.push(item);
            }
        }

        if (organicData?.organic_results) {
            for (const r of organicData.organic_results) {
                const cleaned = cleanPdpUrl(r.link);
                if (cleaned && isPdpUrl(cleaned) && !urls.includes(cleaned)) {
                    urls.push(cleaned);
                } else if (cleaned && cleaned.includes('/collections/')) {
                    try {
                        const colProducts = await resolveShopifyCollection(cleaned, 4);
                        for (const cp of colProducts) {
                            if (cp.url && isPdpUrl(cp.url) && !urls.includes(cp.url)) {
                                urls.push(cp.url);
                            }
                        }
                    } catch(e) {}
                }
                if (r.link) {
                    try {
                        const d = new URL(r.link).hostname;
                        if (!d.includes('google') && !d.includes('amazon') && !d.includes('flipkart') && !d.includes('youtube')) {
                            storeDomainsToProbe.add(d);
                        }
                    } catch(e) {}
                }
            }
        }

        if (storeDomainsToProbe.size > 0) {
            for (const domain of Array.from(storeDomainsToProbe).slice(0, 4)) {
                try {
                    const d2cItems = await searchShopifyD2C(domain, query, 2);
                    for (const item of d2cItems) {
                        if (item.url && isPdpUrl(item.url) && !urls.includes(item.url)) {
                            urls.push(item.url);
                        }
                    }
                } catch(e) {}
            }
        }

        return urls;
    } catch (e) {
        console.warn(`[Search API] SerpAPI error: ${e.message}`);
        return [];
    }
}

function mergeCandidates(listA, listB) {
    const merged = [];
    const seenStores = new Set();
    const combined = [...(listA || []), ...(listB || [])];
    for (const item of combined) {
        let storeKey = '';
        if (typeof item === 'string') {
            try { storeKey = new URL(item).hostname.replace(/^www\./, ''); } catch(e) {}
        } else if (item && item.merchant) {
            storeKey = item.merchant.toLowerCase();
        }
        if (storeKey && !seenStores.has(storeKey)) {
            seenStores.add(storeKey);
            merged.push(item);
        } else if (!storeKey) {
            merged.push(item);
        }
    }
    return merged;
}

// 1. Core Selection Dispatcher
if (searchEngine === 'both') {
    console.log(`[Search API] Querying BOTH Tavily AI & SerpAPI concurrently for query: "${query}"`);
    const [tavilyUrls, serpUrls] = await Promise.all([
        tavilyKey ? fetchTavilyCandidates(query, tavilyKey) : Promise.resolve([]),
        serpApiKey ? fetchSerpApiCandidates(query, serpApiKey, targetMerchant) : Promise.resolve([])
    ]);
    const merged = mergeCandidates(tavilyUrls, serpUrls);
    console.log(`[Search API] Combined discovery complete (${merged.length} candidate URLs/products across stores).`);
    const sliced = merged.slice(0, maxResults * 2);
    SEARCH_CACHE.set(cacheKey, sliced);
    return sliced;
}

if (searchEngine === 'tavily' && tavilyKey) {
    const urls = await fetchTavilyCandidates(query, tavilyKey);
    console.log(`[Search API] Tavily search complete (${urls.length} candidate URLs).`);
    const sliced = urls.slice(0, maxResults);
    SEARCH_CACHE.set(cacheKey, sliced);
    return sliced;
}

if (searchEngine === 'serpapi' && serpApiKey) {
    const urls = await fetchSerpApiCandidates(query, serpApiKey, targetMerchant);
    console.log(`[Search API] SerpAPI search complete (${urls.length} candidate URLs/products).`);
    const sliced = urls.slice(0, maxResults);
    SEARCH_CACHE.set(cacheKey, sliced);
    return sliced;
}

// Default 'auto' behavior: Try Tavily first; if sparse, auto-enrich with SerpAPI
if (tavilyKey) {
    const tavilyUrls = await fetchTavilyCandidates(query, tavilyKey);
    const uniqueDomains = new Set(tavilyUrls.map(u => {
        try { return new URL(u).hostname.replace(/^www\./, ''); } catch(e) { return ''; }
    }).filter(Boolean));

    if (tavilyUrls.length >= 3 && uniqueDomains.size >= 2) {
        console.log(`[Search API] Tavily discovered ${tavilyUrls.length} candidate product URLs across ${uniqueDomains.size} stores.`);
        const sliced = tavilyUrls.slice(0, maxResults);
        SEARCH_CACHE.set(cacheKey, sliced);
        return sliced;
    }

    if (serpApiKey) {
        console.log(`[Search API] Tavily returned only ${uniqueDomains.size} store(s). Auto-enriching with SerpAPI Google Shopping...`);
        const serpUrls = await fetchSerpApiCandidates(query, serpApiKey, targetMerchant);
        const merged = mergeCandidates(tavilyUrls, serpUrls);
        const sliced = merged.slice(0, maxResults);
        SEARCH_CACHE.set(cacheKey, sliced);
        return sliced;
    }

    const sliced = tavilyUrls.slice(0, maxResults);
    SEARCH_CACHE.set(cacheKey, sliced);
    return sliced;
}

if (serpApiKey) {
    const urls = await fetchSerpApiCandidates(query, serpApiKey, targetMerchant);
    const sliced = urls.slice(0, maxResults);
    SEARCH_CACHE.set(cacheKey, sliced);
    return sliced;
}

    // 1C. Google Custom Search API
    if (googleKey && googleCx) {
        try {
            console.log(`[Search API] Querying Google Custom Search API for: "${query}"`);
            const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${googleKey}&cx=${googleCx}&q=${encodeURIComponent(query + ' buy online India')}&num=10`;
            const data = await fetchJson(searchUrl);
            const items = data?.items || [];
            const urls = items.map(i => i.link).filter(isPdpUrl);
            if (urls.length > 0) {
                console.log(`[Search API] Google Search API returned ${urls.length} candidate product URLs.`);
                return urls.slice(0, maxResults);
            }
        } catch (e) {
            console.warn(`[Search API] Google Search API error: ${e.message}`);
        }
    }

    // 1D. Brave Search API
    if (braveKey) {
        try {
            console.log(`[Search API] Querying Brave Search API for: "${query}"`);
            const searchUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query + ' buy online India')}&country=IN&count=10`;
            const data = await fetchJson(searchUrl, { headers: { 'X-Subscription-Token': braveKey } });
            const results = data?.web?.results || [];
            const urls = results.map(r => r.url).filter(isPdpUrl);
            if (urls.length > 0) {
                console.log(`[Search API] Brave Search API returned ${urls.length} candidate product URLs.`);
                return urls.slice(0, maxResults);
            }
        } catch (e) {
            console.warn(`[Search API] Brave Search API error: ${e.message}`);
        }
    }

    return [];
}

async function queryShopifySuggest(domain, query, maxResults = 2) {
    try {
        const encoded = encodeURIComponent(query);
        const url = `https://${domain}/search/suggest.json?q=${encoded}&resources[type]=product`;
        const data = await fetchJson(url);
        const products = data?.resources?.results?.products || [];
        
        return products.slice(0, maxResults).map(p => {
            let productUrl = p.url.split('?')[0];
            if (!productUrl.startsWith('http')) {
                productUrl = `https://${domain}${productUrl}`;
            }
            return {
                title: p.title,
                price: parseFloat(p.price) || null,
                url: productUrl,
                merchant: domain.replace(/^www\./, '').split('.')[0]
            };
        });
    } catch (e) {
        return [];
    }
}

/**
 * 2. Native D2C Store Suggest APIs (Shopify Predictive Search APIs - 100% Reliable & Fast)
 */
async function searchShopifyD2C(domain, query, maxResults = 2) {
    let results = await queryShopifySuggest(domain, query, maxResults);
    if (results.length === 0) {
        // Keyword fallback: Extract core words
        const words = query.split(/\s+/).filter(w => w.length >= 3 && !/noise|cancelling|wireless|bluetooth|classic|black|best|top/i.test(w));
        for (const w of words) {
            results = await queryShopifySuggest(domain, w, maxResults);
            if (results.length > 0) break;
        }
        if (results.length === 0) {
            // General fallback
            const generalWords = query.split(/\s+/).filter(w => w.length >= 4);
            for (const w of generalWords) {
                results = await queryShopifySuggest(domain, w, maxResults);
                if (results.length > 0) break;
            }
        }
    }
    return results;
}

/**
 * Search Snapdeal for matching PDPs
 */
async function searchSnapdeal(query, maxResults = 2) {
    try {
        const encoded = encodeURIComponent(query);
        const searchUrl = `https://www.snapdeal.com/search?keyword=${encoded}&sort=plrty`;
        const res = await fetchHttp(searchUrl);
        const results = [];

        if (res.status === 200 && res.body) {
            const regex = /href=["'](https:\/\/www\.snapdeal\.com\/product\/[^"']+)["']/gi;
            let m;
            while ((m = regex.exec(res.body)) !== null && results.length < maxResults) {
                const link = m[1].split('#')[0].split('?')[0];
                if (!results.some(r => r.url === link)) {
                    results.push({
                        title: '',
                        price: null,
                        url: link,
                        merchant: 'snapdeal'
                    });
                }
            }
        }
        return results;
    } catch (e) {
        return [];
    }
}

/**
 * 3. Fallback Open Search Engine
 */
async function searchOpenWebFallback(query, maxResults = 5) {
    const postData = querystring.stringify({ q: `${query} buy online India` });
    return new Promise((resolve) => {
        const req = https.request('https://html.duckduckgo.com/html/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                const urls = [];
                const re = /href=["']([^"']+)["']/gi;
                let m;
                while ((m = re.exec(body)) !== null) {
                    let link = m[1];
                    if (link.includes('uddg=')) {
                        try {
                            const u = decodeURIComponent(link.split('uddg=')[1].split('&')[0]);
                            if (u.startsWith('http') && isPdpUrl(u) && !urls.includes(u)) urls.push(u);
                        } catch (e) {}
                    }
                }
                resolve(urls.slice(0, maxResults));
            });
        });
        req.on('error', () => resolve([]));
        req.write(postData);
        req.end();
    });
}

/**
 * Universal Multi-Store Candidate Discovery Engine
 * Combines Structured Search API + Direct D2C Native Suggest APIs + Fallback
 */
async function discoverProductUrls(firstArg, options = {}) {
    let query = '';
    let maxPrice = Infinity;
    let minPrice = 0;
    let targetMerchant = null;

    let searchEngine = 'auto';
    if (typeof firstArg === 'string') {
        query = firstArg;
        maxPrice = options.maxPrice !== undefined ? options.maxPrice : Infinity;
        minPrice = options.minPrice || 0;
        targetMerchant = options.targetMerchant || null;
        searchEngine = options.searchEngine || 'auto';
    } else if (firstArg && typeof firstArg === 'object') {
        query = firstArg.query || '';
        maxPrice = firstArg.maxPrice !== undefined ? firstArg.maxPrice : Infinity;
        minPrice = firstArg.minPrice || 0;
        targetMerchant = firstArg.targetMerchant || null;
        searchEngine = firstArg.searchEngine || 'auto';
    }

    console.log(`[Search Discovery] Discovering candidates for: "${query}" (Target Band: ₹${minPrice} – ₹${maxPrice === Infinity ? 'Unlimited' : maxPrice})`);

    const cleanQuery = query
        .replace(/\b(?:find|buy|get|show|search|for|me|a|an|the|in\s+stock|available|rupees|rs|paisa|costing|price)\b/gi, ' ')
        .replace(/\b(?:under|below|less than|max|budget)\b\s*(?:₹|Rs\.?|INR)?\s*[0-9,]+/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const searchQuery = cleanQuery.length > 2 ? cleanQuery : query;
    const candidates = [];
    const seenDomains = new Set();

    // 1. Direct D2C Multi-Store Category Suggestions (Native JSON APIs)
    const lowerQ = searchQuery.toLowerCase();
    const D2C_STORES = [];

    if (/earphone|headphone|earbud|iem|audio|speaker|sound|airdope|basshead|bluetooth|tws/i.test(lowerQ)) {
        D2C_STORES.push('www.headphonezone.in', 'www.boat-lifestyle.com', 'www.mivi.in');
    }
    if (/shirt|tshirt|tee|jeans|hoodie|jacket|trouser|pant|linen|cotton|cloth|apparel|kurta|dress/i.test(lowerQ)) {
        D2C_STORES.push('www.snitch.co.in', 'www.bewakoof.com');
    }
    if (/ring|necklace|pendant|jewel|silver|gold|earring|chain|bracelet|bangle/i.test(lowerQ)) {
        D2C_STORES.push('www.giva.co', 'www.caratlane.com');
    }
    if (/suitcase|trolley|luggage|duffle|bag|backpack|tote|wallet|cabin|travel/i.test(lowerQ)) {
        D2C_STORES.push('mokobara.com', 'zouk.co.in', 'uppercase.co.in');
    }
    if (/dog|cat|pet|puppy|kibble|leash|collar|treat/i.test(lowerQ)) {
        D2C_STORES.push('headsupfortails.com');
    }
    if (/protein|bar|peanut|butter|ghee|honey|snack|oats|food|cookie/i.test(lowerQ)) {
        D2C_STORES.push('thewholetruthfoods.com', 'twobrothersindiashop.com', 'slurrpfarm.com');
    }
    if (/serum|cream|lotion|shampoo|oil|facewash|perfume|fragrance|sunscreen/i.test(lowerQ)) {
        D2C_STORES.push('mamaearth.in', 'mcaffeine.com');
    }
    if (/fan|blender|mixer|camera|smart|home|light/i.test(lowerQ)) {
        D2C_STORES.push('atomberg.com', 'qubo.world');
    }
    if (/book|novel|stationery|journal|pen/i.test(lowerQ)) {
        D2C_STORES.push('crossword.in');
    }
    if (/guitar|piano|keyboard|ukulele|drum|violin|synth|music|bajaao/i.test(lowerQ)) {
        D2C_STORES.push('www.bajaao.com', 'yamahamusicstore.in');
    }

    // Pass the full original user query with price/budget directly to the Structured Search API
    let structuredQuery = query;
    if (targetMerchant && !structuredQuery.toLowerCase().includes(targetMerchant.toLowerCase())) {
        structuredQuery = `${structuredQuery} ${targetMerchant}`;
    }

    // If targetMerchant matches a known D2C brand, ensure it is in D2C_STORES
    if (targetMerchant) {
        const tm = targetMerchant.toLowerCase();
        if (tm.includes('bajaao') && !D2C_STORES.includes('www.bajaao.com')) D2C_STORES.push('www.bajaao.com');
        if (tm.includes('boat') && !D2C_STORES.includes('www.boat-lifestyle.com')) D2C_STORES.push('www.boat-lifestyle.com');
        if (tm.includes('snitch') && !D2C_STORES.includes('www.snitch.co.in')) D2C_STORES.push('www.snitch.co.in');
        if (tm.includes('giva') && !D2C_STORES.includes('www.giva.co')) D2C_STORES.push('www.giva.co');
        if (tm.includes('mamaearth') && !D2C_STORES.includes('mamaearth.in')) D2C_STORES.push('mamaearth.in');
        if (tm.includes('atomberg') && !D2C_STORES.includes('atomberg.com')) D2C_STORES.push('atomberg.com');
    }

    // Query D2C Native APIs, Structured Search API, and Snapdeal concurrently
    const d2cPromises = D2C_STORES.map(async domain => {
        const isTargetDomain = targetMerchant && domain.includes(targetMerchant.toLowerCase());
        const count = isTargetDomain ? 6 : 4;
        let items = await searchShopifyD2C(domain, searchQuery, count);
        // If high budget query without specific brand requested, check tier variations (generic descriptors only, NO brand bias)
        if (maxPrice >= 15000) {
            const premiumQueries = [];
            if (/guitar|music/i.test(lowerQ)) {
                premiumQueries.push(`${searchQuery} solid wood`, `${searchQuery} electro acoustic`);
            } else if (/earphone|headphone|audio/i.test(lowerQ)) {
                premiumQueries.push(`${searchQuery} pro`, `${searchQuery} anc`);
            } else if (/suitcase|luggage/i.test(lowerQ)) {
                premiumQueries.push(`${searchQuery} large`, `${searchQuery} check-in`);
            }
            for (const pq of premiumQueries) {
                const pItems = await searchShopifyD2C(domain, pq, 4);
                items = [...items, ...pItems];
            }
        }
        return items;
    });
    const searchApiPromise = searchStructuredApi(structuredQuery, 6, targetMerchant, searchEngine);
    const snapdealPromise = (targetMerchant && targetMerchant.toLowerCase().includes('snapdeal'))
        ? searchSnapdeal(searchQuery, 4)
        : Promise.resolve([]);

    const [d2cResults, apiResults, snapdealResults] = await Promise.all([
        Promise.all(d2cPromises),
        searchApiPromise,
        snapdealPromise
    ]);

    // 1. Ingest D2C products (prioritizing items within budget)
    const flatD2c = d2cResults.flat().filter(item => !item.price || item.price <= maxPrice);
    flatD2c.sort((a, b) => (b.price || 0) - (a.price || 0));

    for (const item of flatD2c) {
        try {
            const domain = new URL(item.url).hostname.replace(/^www\./, '');
            const maxForDomain = (targetMerchant && domain.includes(targetMerchant.toLowerCase())) ? 4 : 1;
            const currentCount = candidates.filter(u => {
                try { return new URL(u).hostname.replace(/^www\./, '') === domain; } catch(e) { return false; }
            }).length;
            if (currentCount < maxForDomain) {
                candidates.push(item.url);
            }
        } catch (e) {}
    }

    // 2. Ingest Search API results
    for (const item of apiResults) {
        if (typeof item === 'string') {
            try {
                const domain = new URL(item).hostname.replace(/^www\./, '');
                if (!seenDomains.has(domain)) {
                    seenDomains.add(domain);
                    candidates.push(item);
                }
            } catch (e) {}
        } else if (item && typeof item === 'object' && item.merchant) {
            const m = item.merchant.toLowerCase();
            if (!seenDomains.has(m) && (!item.price || item.price <= maxPrice)) {
                seenDomains.add(m);
                candidates.push(item);
            }
        }
    }

    // 3. Ingest Snapdeal results
    for (const item of snapdealResults) {
        const domain = new URL(item.url).hostname.replace(/^www\./, '');
        if (!seenDomains.has(domain)) {
            seenDomains.add(domain);
            candidates.push(item.url);
        }
    }

    // 4. Fallback search if candidates < 2
    if (candidates.length < 2) {
        const fallbackUrls = await searchOpenWebFallback(searchQuery, 3);
        for (const url of fallbackUrls) {
            try {
                const domain = new URL(url).hostname.replace(/^www\./, '');
                if (!seenDomains.has(domain)) {
                    seenDomains.add(domain);
                    candidates.push(url);
                }
            } catch (e) {}
        }
    }

    console.log(`[Search Discovery] Discovered ${candidates.length} candidate store URLs across distinct domains:`);
    candidates.forEach((c, i) => console.log(`   [${i + 1}] ${c}`));

    return candidates;
}

module.exports = {
    isPdpUrl,
    cleanPdpUrl,
    resolveDirectStorePdp,
    buildMerchantStoreUrl,
    searchStructuredApi,
    searchShopifyD2C,
    searchSnapdeal,
    discoverProductUrls
};
