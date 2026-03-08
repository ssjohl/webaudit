/**
 * Concurrent crawl engine.
 * Manages a URL queue, N concurrent workers, rate limiting, and scope rules.
 */

import { fetchPage, fetchHead } from './fetcher.js';
import { parsePage } from './parser.js';
import { normaliseUrl, isInScope, isSameDomain } from './url-utils.js';
import { isDisallowed } from './robots.js';
import { checkSecurityHeaders } from './security-checker.js';

/**
 * Run a crawl.
 *
 * @param {Object} options
 * @param {string[]} options.startUrls - URLs to begin crawling from
 * @param {string} options.domain - The domain being crawled
 * @param {string[]} options.startPaths - The in-scope paths (one per start URL)
 * @param {Object} options.config - Project config
 * @param {Object} options.robots - Parsed robots.txt
 * @param {Dashboard} options.dashboard - CLI dashboard instance
 * @param {Object} [options.resumeState] - Previous scan state to resume from
 * @returns {Promise<Object>} - Map of normalised URL → page result
 */
export async function crawl({
    startUrls,
    domain,
    startPaths,
    config,
    robots,
    dashboard,
    resumeState = null,
}) {
    const {
        concurrency = 5,
        rateLimit = 200,
        maxDepth = 10,
        maxRedirects = 10,
        ignorableParams = [],
        blockedDomains = [],
        timeout = 30000,
        cookies = '',
        basicAuth = '',
    } = config;

    const blockedSet = new Set(blockedDomains.map((d) => d.toLowerCase()));
    const fetchOptions = { timeout, maxRedirects, cookies, basicAuth };

    // State
    const visited = new Set(resumeState?.visited || []);
    const results = resumeState?.results || {};
    const queue = resumeState?.queue
        ? resumeState.queue.map((item) =>
            typeof item === 'string' ? { url: item, depth: 0, from: null } : item
        )
        : startUrls.map((url) => ({
            url: normaliseUrl(url, ignorableParams),
            depth: 0,
            from: null,
        }));

    // Counters for dashboard
    let internalCount = Object.values(results).filter((r) => r.type === 'internal').length;
    let externalCount = Object.values(results).filter((r) => r.type === 'external').length;
    let brokenCount = Object.values(results).filter(
        (r) => r.status >= 400 || r.status === 0
    ).length;
    let errorCount = Object.values(results).filter((r) => r.error).length;

    let lastRequestTime = 0;
    let activeWorkers = 0;
    let stopped = false;

    const getState = () => ({
        status: 'in-progress',
        startUrls,
        visited: [...visited],
        queue: queue.map((q) => ({ url: q.url, depth: q.depth, from: q.from })),
        results,
    });

    crawl.getState = getState;

    function updateDashboard(currentUrl = '') {
        dashboard.update({
            totalDiscovered: visited.size + queue.length,
            totalScanned: visited.size,
            internalLinks: internalCount,
            externalLinks: externalCount,
            brokenLinks: brokenCount,
            errors: errorCount,
            currentUrl,
        });
    }

    async function rateLimitWait() {
        const now = Date.now();
        const elapsed = now - lastRequestTime;
        if (elapsed < rateLimit) {
            await new Promise((resolve) => setTimeout(resolve, rateLimit - elapsed));
        }
        lastRequestTime = Date.now();
    }

    async function processUrl(item) {
        const { url, depth, from } = item;
        const normUrl = normaliseUrl(url, ignorableParams);

        if (visited.has(normUrl)) return;
        visited.add(normUrl);

        updateDashboard(url);
        await rateLimitWait();

        const internal = isSameDomain(url, domain);
        const inScope = internal && startPaths.some((sp) => isInScope(url, sp));
        const robotsBlocked = robots ? isDisallowed(robots, url) : false;

        if (internal && inScope) {
            if (depth > maxDepth) {
                results[normUrl] = createResult(url, normUrl, {
                    robotsDisallowed: robotsBlocked,
                    depth,
                    type: 'internal',
                    linkedFrom: from ? [from] : [],
                    error: 'Max depth exceeded',
                });
                errorCount++;
                updateDashboard();
                return;
            }

            const result = await fetchPage(url, fetchOptions);

            const pageResult = createResult(url, normUrl, {
                status: result.status,
                finalUrl: result.finalUrl,
                mimeType: result.mimeType,
                loadTimeMs: result.loadTimeMs,
                contentLength: result.contentLength,
                robotsDisallowed: robotsBlocked,
                depth,
                type: 'internal',
                linkedFrom: from ? [from] : [],
                error: result.error,
                redirectChain: result.redirectChain,
                redirectLoop: result.redirectLoop,
                headers: result.headers,
            });

            // Security headers check
            if (result.headers) {
                pageResult.security = checkSecurityHeaders(result.headers);
            }

            internalCount++;
            if (result.status >= 400 || result.status === 0) brokenCount++;
            if (result.error) errorCount++;

            // Parse HTML content
            if (result.body && result.mimeType?.includes('html')) {
                const { metadata, links } = parsePage(result.body, result.finalUrl || url);
                pageResult.metadata = metadata;

                for (const link of links) {
                    const resolvedNorm = normaliseUrl(link.resolved, ignorableParams);
                    const linkInternal = isSameDomain(link.resolved, domain);

                    if (linkInternal) {
                        pageResult.links.internal.push({
                            href: link.resolved,
                            rel: link.rel,
                            text: link.text,
                        });

                        const linkInScope = startPaths.some((sp) => isInScope(link.resolved, sp));
                        if (linkInScope && !visited.has(resolvedNorm)) {
                            queue.push({
                                url: link.resolved,
                                depth: depth + 1,
                                from: url,
                            });
                        }
                    } else {
                        pageResult.links.external.push({
                            href: link.resolved,
                            rel: link.rel,
                            text: link.text,
                        });

                        const extDomain = new URL(link.resolved).hostname.toLowerCase();
                        if (!blockedSet.has(extDomain) && !visited.has(resolvedNorm)) {
                            queue.push({
                                url: link.resolved,
                                depth: depth + 1,
                                from: url,
                                external: true,
                            });
                        }
                    }
                }
            }

            results[normUrl] = pageResult;
        } else if (internal && !inScope) {
            if (!results[normUrl]) {
                results[normUrl] = createResult(url, normUrl, {
                    robotsDisallowed: robotsBlocked,
                    depth,
                    type: 'internal',
                    linkedFrom: from ? [from] : [],
                    error: 'Out of scope — not crawled',
                });
                internalCount++;
            } else if (from) {
                results[normUrl].linkedFrom.push(from);
            }
        } else {
            // External link
            const extDomain = new URL(url).hostname.toLowerCase();
            if (blockedSet.has(extDomain)) return;

            const result = await fetchHead(url, fetchOptions);
            results[normUrl] = createResult(url, normUrl, {
                status: result.status,
                finalUrl: result.finalUrl,
                mimeType: result.mimeType,
                loadTimeMs: result.loadTimeMs,
                contentLength: result.contentLength,
                depth,
                type: 'external',
                linkedFrom: from ? [from] : [],
                error: result.error,
                redirectChain: result.redirectChain,
                redirectLoop: result.redirectLoop,
            });

            externalCount++;
            if (result.status >= 400 || result.status === 0) brokenCount++;
            if (result.error) errorCount++;
        }

        updateDashboard();
    }

    async function worker() {
        while (queue.length > 0 && !stopped) {
            const item = queue.shift();
            if (!item) break;

            const normUrl = normaliseUrl(item.url, ignorableParams);
            if (visited.has(normUrl)) continue;

            if (results[normUrl] && item.from) {
                if (!results[normUrl].linkedFrom.includes(item.from)) {
                    results[normUrl].linkedFrom.push(item.from);
                }
                continue;
            }

            await processUrl(item);
        }
    }

    async function runWorkers() {
        while (queue.length > 0 && !stopped) {
            const promises = [];
            while (activeWorkers < concurrency && queue.length > 0 && !stopped) {
                activeWorkers++;
                promises.push(
                    worker().finally(() => {
                        activeWorkers--;
                    })
                );
            }

            if (promises.length > 0) {
                await Promise.all(promises);
            }

            if (queue.length > 0 && !stopped) {
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
        }
    }

    crawl.stop = () => {
        stopped = true;
    };

    await runWorkers();
    return results;
}

/**
 * Create a standardised page result object.
 */
function createResult(url, normUrl, overrides = {}) {
    return {
        url,
        normalizedUrl: normUrl,
        status: null,
        finalUrl: url,
        mimeType: null,
        loadTimeMs: 0,
        contentLength: 0,
        robotsDisallowed: false,
        depth: 0,
        type: 'internal',
        metadata: null,
        links: { internal: [], external: [] },
        linkedFrom: [],
        error: null,
        redirectChain: [],
        redirectLoop: false,
        security: null,
        ...overrides,
    };
}
