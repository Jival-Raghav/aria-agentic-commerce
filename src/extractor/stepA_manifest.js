/**
 * Step A — Manifest Check (UCP / ACP / Shopify MCP)
 * Companion to extractor-implementation-plan.md Step A
 */

const https = require('https');
const http = require('http');
const { createProductRecord, ProvenanceSourceEnum } = require('../catalog/schema');

async function fetchWithTimeout(url, timeoutMs = 4000) {
    return new Promise((resolve) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json, text/plain, */*'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({
                status: res.statusCode,
                headers: res.headers,
                body: data
            }));
        });
        req.on('error', (err) => resolve({ status: null, error: err.message, body: '' }));
        req.setTimeout(timeoutMs, () => {
            req.destroy();
            resolve({ status: 'TIMEOUT', error: 'Request timed out', body: '' });
        });
    });
}

function isRealJsonManifest(body, contentType) {
    if (!body || typeof body !== 'string') return false;
    const trimmed = body.trim();
    if (trimmed.startsWith('<html') || trimmed.startsWith('<!doctype') || trimmed.startsWith('<div')) {
        return false; // HTML SPA catch-all false positive
    }
    try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object') {
            // Must contain manifest-like keys
            return (
                parsed.ucp_version ||
                parsed.acp_version ||
                parsed.services ||
                parsed.endpoints ||
                parsed.catalog_url ||
                parsed.mcp_version ||
                parsed.protocol
            );
        }
    } catch (e) {}
    return false;
}

async function checkManifests(merchantDomain) {
    const domain = merchantDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
    const urls = [
        `https://${domain}/.well-known/ucp`,
        `https://${domain}/.well-known/acp`,
        `https://${domain}/api/mcp`
    ];

    const findings = [];

    for (const url of urls) {
        const res = await fetchWithTimeout(url, 3000);
        const isJson = isRealJsonManifest(res.body, res.headers ? res.headers['content-type'] : '');
        findings.push({
            url,
            status: res.status,
            isJsonManifest: isJson
        });

        if (res.status === 200 && isJson) {
            try {
                const manifestJson = JSON.parse(res.body);
                return {
                    found: true,
                    type: url.includes('mcp') ? 'shopify_mcp' : 'ucp_manifest',
                    manifestUrl: url,
                    rawManifest: manifestJson,
                    findings
                };
            } catch (e) {}
        }
    }

    return {
        found: false,
        findings
    };
}

module.exports = {
    checkManifests
};
