/**
 * Sitemap.xml fetcher, parser, and comparison.
 */

/**
 * Fetch and parse sitemap.xml (handles sitemap index files).
 * @param {string} domain
 * @param {string} scheme - 'http' or 'https'
 * @returns {Promise<string[]>} - Array of URLs found in the sitemap
 */
export async function fetchSitemap(domain, scheme = 'https') {
    const sitemapUrl = `${scheme}://${domain}/sitemap.xml`;
    const urls = new Set();

    try {
        await parseSitemapUrl(sitemapUrl, urls, 0);
    } catch {
        // Sitemap unavailable — return empty
    }

    return [...urls];
}

/**
 * Recursively parse a sitemap URL (handles sitemap index files).
 */
async function parseSitemapUrl(url, urls, depth) {
    if (depth > 3) return; // Prevent infinite recursion

    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(15000),
            headers: { 'User-Agent': 'webaudit/1.0' },
        });

        if (!response.ok) return;

        const body = await response.text();

        // Check if it's a sitemap index (contains <sitemapindex>)
        if (body.includes('<sitemapindex')) {
            const sitemapUrls = extractTagContent(body, 'loc');
            for (const sitemapUrl of sitemapUrls) {
                await parseSitemapUrl(sitemapUrl, urls, depth + 1);
            }
        } else {
            // Regular sitemap — extract URLs
            const pageUrls = extractTagContent(body, 'loc');
            for (const pageUrl of pageUrls) {
                urls.add(pageUrl);
            }
        }
    } catch {
        // Individual sitemap failed — continue
    }
}

/**
 * Simple XML tag content extractor (no full XML parser needed).
 */
function extractTagContent(xml, tagName) {
    const results = [];
    const regex = new RegExp(`<${tagName}[^>]*>([^<]+)</${tagName}>`, 'gi');
    let match;
    while ((match = regex.exec(xml)) !== null) {
        results.push(match[1].trim());
    }
    return results;
}

/**
 * Compare sitemap URLs with crawled URLs.
 * @param {string[]} sitemapUrls - URLs from sitemap
 * @param {Object} crawledResults - Map of normalised URL → page result
 * @returns {{ orphanPages: string[], unindexedPages: string[] }}
 */
export function compareSitemap(sitemapUrls, crawledResults) {
    const crawledSet = new Set(Object.keys(crawledResults));
    const sitemapSet = new Set(sitemapUrls);

    // Orphan pages: in sitemap but not discovered by crawler
    const orphanPages = sitemapUrls.filter((url) => {
        // Try both with and without trailing slash
        return !crawledSet.has(url) && !crawledSet.has(url.replace(/\/$/, '')) && !crawledSet.has(url + '/');
    });

    // Unindexed pages: discovered by crawler but not in sitemap
    const crawledInternal = Object.values(crawledResults)
        .filter((p) => p.type === 'internal' && p.status === 200)
        .map((p) => p.url);

    const unindexedPages = crawledInternal.filter((url) => {
        return !sitemapSet.has(url) && !sitemapSet.has(url.replace(/\/$/, '')) && !sitemapSet.has(url + '/');
    });

    return { orphanPages, unindexedPages };
}
