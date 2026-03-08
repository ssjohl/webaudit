/**
 * Smoke test — bypasses interactive prompts to test the crawl pipeline directly.
 */

import { normaliseUrl } from '../src/url-utils.js';
import { loadRobotsTxt } from '../src/robots.js';
import { crawl } from '../src/crawler.js';
import { Dashboard } from '../src/dashboard.js';
import { writeResults, printSummary } from '../src/results.js';
import { generateScanId, markCompleted } from '../src/state.js';

const startUrls = ['http://example.com'];
const domain = 'example.com';
const startPaths = ['/'];
const scanId = generateScanId();

const config = {
    concurrency: 3,
    rateLimit: 100,
    maxDepth: 2,
    timeout: 15000,
    ignorableParams: [],
    blockedDomains: [],
};

console.log(`\n  🧪  Smoke test: crawling ${startUrls[0]}...\n`);

const robots = await loadRobotsTxt(domain, 'http');
console.log('  ✅  robots.txt loaded');

const dashboard = new Dashboard();
dashboard.start(domain, '/');

const normStartUrls = startUrls.map((u) => normaliseUrl(u, config.ignorableParams));

try {
    const results = await crawl({
        startUrls: normStartUrls,
        domain,
        startPaths,
        config,
        robots,
        dashboard,
    });

    dashboard.stop();
    await markCompleted(domain, scanId);

    const resultsDir = await writeResults(domain, scanId, results, startUrls);
    printSummary(results, resultsDir);

    // Basic assertions
    const pages = Object.values(results);
    if (pages.length === 0) {
        console.error('  ❌ FAIL: No pages were crawled');
        process.exit(1);
    }

    const mainPage = pages.find((p) => p.url.includes('example.com'));
    if (!mainPage) {
        console.error('  ❌ FAIL: Main page not found in results');
        process.exit(1);
    }

    if (mainPage.status !== 200) {
        console.error(`  ❌ FAIL: Expected status 200, got ${mainPage.status}`);
        process.exit(1);
    }

    if (!mainPage.metadata?.title) {
        console.error('  ❌ FAIL: Title not extracted');
        process.exit(1);
    }

    console.log(`  ✅  Crawled ${pages.length} page(s)`);
    console.log(`  ✅  Status: ${mainPage.status}`);
    console.log(`  ✅  Title: "${mainPage.metadata.title}"`);
    console.log(`  ✅  Load time: ${mainPage.loadTimeMs}ms`);
    console.log('\n  🎉  All smoke test assertions passed!\n');
} catch (err) {
    dashboard.stop();
    console.error(`\n  ❌ FAIL: ${err.message}\n`);
    console.error(err.stack);
    process.exit(1);
}
