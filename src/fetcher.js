/**
 * HTTP fetcher with retry logic and exponential backoff.
 */

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT = 30000;
const BASE_DELAY = 1000;

/**
 * Fetch a full page (GET request).
 * Returns { url, status, mimeType, body, loadTimeMs, headers, error }
 */
export async function fetchPage(url, options = {}) {
    const { maxRetries = DEFAULT_MAX_RETRIES, timeout = DEFAULT_TIMEOUT } = options;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const start = Date.now();
            const response = await fetch(url, {
                method: 'GET',
                redirect: 'follow',
                signal: AbortSignal.timeout(timeout),
                headers: {
                    'User-Agent': 'webaudit/1.0 (Node.js site auditor)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
            });
            const loadTimeMs = Date.now() - start;

            const mimeType = (response.headers.get('content-type') || '').split(';')[0].trim();
            let body = null;

            if (mimeType.includes('html') || mimeType.includes('xml') || mimeType.includes('text')) {
                body = await response.text();
            }

            return {
                url,
                status: response.status,
                mimeType,
                body,
                loadTimeMs,
                headers: Object.fromEntries(response.headers.entries()),
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
                status: 0,
                mimeType: null,
                body: null,
                loadTimeMs: 0,
                headers: {},
                error: err.message || 'Unknown fetch error',
            };
        }
    }
}

/**
 * Fetch only headers (HEAD request) — used for external link checking.
 * Falls back to GET with early abort if HEAD fails.
 * Returns { url, status, mimeType, loadTimeMs, error }
 */
export async function fetchHead(url, options = {}) {
    const { maxRetries = DEFAULT_MAX_RETRIES, timeout = DEFAULT_TIMEOUT } = options;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const start = Date.now();

            // Try HEAD first, some servers don't support it
            let response;
            try {
                response = await fetch(url, {
                    method: 'HEAD',
                    redirect: 'follow',
                    signal: AbortSignal.timeout(timeout),
                    headers: {
                        'User-Agent': 'webaudit/1.0 (Node.js site auditor)',
                    },
                });
            } catch {
                // HEAD failed, try GET
                response = await fetch(url, {
                    method: 'GET',
                    redirect: 'follow',
                    signal: AbortSignal.timeout(timeout),
                    headers: {
                        'User-Agent': 'webaudit/1.0 (Node.js site auditor)',
                    },
                });
            }

            const loadTimeMs = Date.now() - start;
            const mimeType = (response.headers.get('content-type') || '').split(';')[0].trim();

            return {
                url,
                status: response.status,
                mimeType,
                loadTimeMs,
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
                status: 0,
                mimeType: null,
                loadTimeMs: 0,
                error: err.message || 'Unknown fetch error',
            };
        }
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
