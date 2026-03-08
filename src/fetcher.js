/**
 * HTTP fetcher with retry logic, exponential backoff, redirect chain tracking,
 * resource size tracking, and auth support.
 */

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_MAX_REDIRECTS = 10;
const BASE_DELAY = 1000;

/**
 * Build common request headers, including optional cookies and basic auth.
 */
function buildHeaders(options = {}) {
    const headers = {
        'User-Agent': 'webaudit/1.0 (Node.js site auditor)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };

    if (options.cookies) {
        headers['Cookie'] = options.cookies;
    }

    if (options.basicAuth) {
        const encoded = Buffer.from(options.basicAuth).toString('base64');
        headers['Authorization'] = `Basic ${encoded}`;
    }

    return headers;
}

/**
 * Manually follow redirects to capture the full redirect chain.
 * Returns { finalResponse, chain, isLoop }
 */
async function followRedirects(url, options = {}) {
    const {
        timeout = DEFAULT_TIMEOUT,
        maxRedirects = DEFAULT_MAX_REDIRECTS,
        method = 'GET',
    } = options;
    const headers = buildHeaders(options);
    if (method === 'HEAD') {
        delete headers['Accept'];
    }

    const chain = [];
    let currentUrl = url;
    const seen = new Set();
    let isLoop = false;

    for (let i = 0; i < maxRedirects; i++) {
        if (seen.has(currentUrl)) {
            isLoop = true;
            break;
        }
        seen.add(currentUrl);

        const response = await fetch(currentUrl, {
            method,
            redirect: 'manual',
            signal: AbortSignal.timeout(timeout),
            headers,
        });

        const status = response.status;
        const location = response.headers.get('location');

        if (status >= 300 && status < 400 && location) {
            // Resolve relative redirect
            let nextUrl;
            try {
                nextUrl = new URL(location, currentUrl).toString();
            } catch {
                nextUrl = location;
            }

            chain.push({ url: currentUrl, status, location: nextUrl });
            currentUrl = nextUrl;

            // Consume the body to avoid memory leaks
            try { await response.text(); } catch { /* ignore */ }
            continue;
        }

        // Not a redirect — we have our final response
        return { finalResponse: response, finalUrl: currentUrl, chain, isLoop };
    }

    // Exceeded max redirects
    return { finalResponse: null, finalUrl: currentUrl, chain, isLoop };
}

/**
 * Fetch a full page (GET request) with redirect chain tracking.
 * Returns { url, finalUrl, status, mimeType, body, loadTimeMs, headers, contentLength, redirectChain, redirectLoop, error }
 */
export async function fetchPage(url, options = {}) {
    const { maxRetries = DEFAULT_MAX_RETRIES, timeout = DEFAULT_TIMEOUT, maxRedirects = DEFAULT_MAX_REDIRECTS } = options;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const start = Date.now();
            const { finalResponse, finalUrl, chain, isLoop } = await followRedirects(url, {
                ...options,
                timeout,
                maxRedirects,
                method: 'GET',
            });
            const loadTimeMs = Date.now() - start;

            if (!finalResponse) {
                return {
                    url,
                    finalUrl,
                    status: 0,
                    mimeType: null,
                    body: null,
                    loadTimeMs,
                    headers: {},
                    contentLength: 0,
                    redirectChain: chain,
                    redirectLoop: isLoop,
                    error: isLoop ? 'Redirect loop detected' : 'Too many redirects',
                };
            }

            const mimeType = (finalResponse.headers.get('content-type') || '').split(';')[0].trim();
            let body = null;
            let contentLength = parseInt(finalResponse.headers.get('content-length') || '0', 10);

            if (mimeType.includes('html') || mimeType.includes('xml') || mimeType.includes('text')) {
                body = await finalResponse.text();
                if (!contentLength) contentLength = Buffer.byteLength(body, 'utf-8');
            } else {
                // Consume body to free resources
                try { await finalResponse.arrayBuffer(); } catch { /* ignore */ }
            }

            return {
                url,
                finalUrl,
                status: finalResponse.status,
                mimeType,
                body,
                loadTimeMs,
                headers: Object.fromEntries(finalResponse.headers.entries()),
                contentLength,
                redirectChain: chain,
                redirectLoop: isLoop,
                error: null,
            };
        } catch (err) {
            if (attempt < maxRetries - 1) {
                const delay = BASE_DELAY * Math.pow(2, attempt);
                await sleep(delay);
                continue;
            }

            return {
                url,
                finalUrl: url,
                status: 0,
                mimeType: null,
                body: null,
                loadTimeMs: 0,
                headers: {},
                contentLength: 0,
                redirectChain: [],
                redirectLoop: false,
                error: err.message || 'Unknown fetch error',
            };
        }
    }
}

/**
 * Fetch only headers (HEAD request) with redirect chain tracking.
 * Falls back to GET if HEAD fails.
 * Returns { url, finalUrl, status, mimeType, loadTimeMs, contentLength, redirectChain, redirectLoop, error }
 */
export async function fetchHead(url, options = {}) {
    const { maxRetries = DEFAULT_MAX_RETRIES, timeout = DEFAULT_TIMEOUT, maxRedirects = DEFAULT_MAX_REDIRECTS } = options;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const start = Date.now();

            let result;
            try {
                result = await followRedirects(url, { ...options, timeout, maxRedirects, method: 'HEAD' });
            } catch {
                result = await followRedirects(url, { ...options, timeout, maxRedirects, method: 'GET' });
            }

            const { finalResponse, finalUrl, chain, isLoop } = result;
            const loadTimeMs = Date.now() - start;

            if (!finalResponse) {
                return {
                    url,
                    finalUrl,
                    status: 0,
                    mimeType: null,
                    loadTimeMs,
                    contentLength: 0,
                    redirectChain: chain,
                    redirectLoop: isLoop,
                    error: isLoop ? 'Redirect loop detected' : 'Too many redirects',
                };
            }

            const mimeType = (finalResponse.headers.get('content-type') || '').split(';')[0].trim();
            const contentLength = parseInt(finalResponse.headers.get('content-length') || '0', 10);

            // Consume body
            try { await finalResponse.text(); } catch { /* ignore */ }

            return {
                url,
                finalUrl,
                status: finalResponse.status,
                mimeType,
                loadTimeMs,
                contentLength,
                redirectChain: chain,
                redirectLoop: isLoop,
                error: null,
            };
        } catch (err) {
            if (attempt < maxRetries - 1) {
                const delay = BASE_DELAY * Math.pow(2, attempt);
                await sleep(delay);
                continue;
            }

            return {
                url,
                finalUrl: url,
                status: 0,
                mimeType: null,
                loadTimeMs: 0,
                contentLength: 0,
                redirectChain: [],
                redirectLoop: false,
                error: err.message || 'Unknown fetch error',
            };
        }
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
