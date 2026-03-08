/**
 * Concurrent crawl engine.
 * Manages a URL queue, N concurrent workers, rate limiting, and scope rules.
 */

import { fetchPage, fetchHead } from './fetcher.js';
import { parsePage } from './parser.js';
import { normaliseUrl, isInScope, isSameDomain } from './url-utils.js';
import { isDisallowed } from './robots.js';

/**
 * Run a crawl.
 *
 * @param {Object} options
 * @param {string[]} options.startUrls - URLs to begin crawling from
 * @param {string} options.domain - The domain being crawled
 * @param {string[]} options.startPaths - The in-scope paths (one per start URL)
 * @param {Object} options.config - Project config (concurrency, rateLimit, maxDepth, etc.)
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
        ignorableParams = [],
        blockedDomains = [],
        timeout = 30000,
    } = config;

    const blockedSet = new Set(blockedDomains.map((d) => d.toLowerCase()));

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

    // Active worker count (for the semaphore)
    let activeWorkers = 0;
    let lastRequestTime = 0;
    let stopped = false;

    // State snapshot callback (set by caller for SIGINT handling)
    const getState = () => ({
        status: 'in-progress',
        startUrls,
        visited: [...visited],
        queue: queue.map((q) => ({ url: q.url, depth: q.depth, from: q.from })),
        results,
    });

    // Expose getState for the CLI to call on SIGINT
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

    /**
     * Rate-limited delay before each request.
     */
    async function rateLimitWait() {
        const now = Date.now();
        const elapsed = now - lastRequestTime;
        if (elapsed < rateLimit) {
            await new Promise((resolve) => setTimeout(resolve, rateLimit - elapsed));
        }
        lastRequestTime = Date.now();
    }

    /**
     * Process a single URL from the queue.
     */
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
            // Full crawl of internal, in-scope pages
            if (depth > maxDepth) {
                results[normUrl] = {
                    url,
                    normalizedUrl: normUrl,
                    status: null,
                    mimeType: null,
                    loadTimeMs: 0,
                    robotsDisallowed: robotsBlocked,
                    depth,
                    type: 'internal',
                    metadata: null,
                    links: { internal: [], external: [] },
                    linkedFrom: from ? [from] : [],
                    error: 'Max depth exceeded',
                };
                errorCount++;
                updateDashboard();
                return;
            }

            const result = await fetchPage(url, { timeout });

            const pageResult = {
                url,
                normalizedUrl: normUrl,
                status: result.status,
                mimeType: result.mimeType,
                loadTimeMs: result.loadTimeMs,
                robotsDisallowed: robotsBlocked,
                depth,
                type: 'internal',
                metadata: null,
                links: { internal: [], external: [] },
                linkedFrom: from ? [from] : [],
                error: result.error,
            };

            internalCount++;
            if (result.status >= 400 || result.status === 0) brokenCount++;
            if (result.error) errorCount++;

            // Parse HTML content
            if (result.body && result.mimeType?.includes('html')) {
                const { metadata, links } = parsePage(result.body, url);
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

                        // Add to queue if in scope and not visited
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

                        // Check external links (HEAD only) if not blocked and not already checked
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
            // Internal but out of scope — record but don't crawl
            if (!results[normUrl]) {
                results[normUrl] = {
                    url,
                    normalizedUrl: normUrl,
                    status: null,
                    mimeType: null,
                    loadTimeMs: 0,
                    robotsDisallowed: robotsBlocked,
                    depth,
                    type: 'internal',
                    metadata: null,
                    links: { internal: [], external: [] },
                    linkedFrom: from ? [from] : [],
                    error: 'Out of scope — not crawled',
                };
                internalCount++;
            } else if (from) {
                results[normUrl].linkedFrom.push(from);
            }
        } else {
            // External link — HEAD check only
            const extDomain = new URL(url).hostname.toLowerCase();
            if (blockedSet.has(extDomain)) return;

            const result = await fetchHead(url, { timeout });
            results[normUrl] = {
                url,
                normalizedUrl: normUrl,
                status: result.status,
                mimeType: result.mimeType,
                loadTimeMs: result.loadTimeMs,
                robotsDisallowed: false,
                depth,
                type: 'external',
                metadata: null,
                links: { internal: [], external: [] },
                linkedFrom: from ? [from] : [],
                error: result.error,
            };

            externalCount++;
            if (result.status >= 400 || result.status === 0) brokenCount++;
            if (result.error) errorCount++;
        }

        updateDashboard();
    }

    /**
     * Worker loop: pull items from the queue until empty.
     */
    async function worker() {
        while (queue.length > 0 && !stopped) {
            const item = queue.shift();
            if (!item) break;

            const normUrl = normaliseUrl(item.url, ignorableParams);
            if (visited.has(normUrl)) continue;

            // Track linkedFrom for already-visited pages
            if (results[normUrl] && item.from) {
                if (!results[normUrl].linkedFrom.includes(item.from)) {
                    results[normUrl].linkedFrom.push(item.from);
                }
                continue;
            }

            await processUrl(item);
        }
    }

    /**
     * Run concurrent workers until the queue is exhausted.
     */
    async function runWorkers() {
        // Keep spawning workers as long as queue has items
        while (queue.length > 0 && !stopped) {
            // Fill up to concurrency limit
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

            // Small pause to allow new items to be discovered
            if (queue.length > 0 && !stopped) {
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
        }
    }

    // Expose stop function
    crawl.stop = () => {
        stopped = true;
    };

    await runWorkers();
    return results;
}
