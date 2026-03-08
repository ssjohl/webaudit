/**
 * Smoke test — tests the full Phase 2 crawl + analysis pipeline.
 */

import { normaliseUrl } from '../src/url-utils.js';
import { loadRobotsTxt } from '../src/robots.js';
import { crawl } from '../src/crawler.js';
import { Dashboard } from '../src/dashboard.js';
import { writeResults, printSummary } from '../src/results.js';
import { generateScanId, markCompleted } from '../src/state.js';
import { analyzeSEO } from '../src/seo-analyzer.js';
import { fetchSitemap, compareSitemap } from '../src/sitemap.js';
import { generateReport } from '../src/report.js';
import { readFile } from 'node:fs/promises';

const startUrls = ['http://example.com'];
const domain = 'example.com';
const startPaths = ['/'];
const scanId = generateScanId();

const config = {
    concurrency: 3,
    rateLimit: 100,
    maxDepth: 2,
    maxRedirects: 10,
    timeout: 15000,
    ignorableParams: [],
    blockedDomains: [],
    cookies: '',
    basicAuth: '',
};

console.log(`\n  🧪  Phase 2 smoke test: crawling ${startUrls[0]}...\n`);

// Robots
const robots = await loadRobotsTxt(domain, 'http');
console.log('  ✅  robots.txt loaded');

// Sitemap
const sitemapUrls = await fetchSitemap(domain, 'http');
console.log(`  ✅  Sitemap: ${sitemapUrls.length} URLs`);

// Crawl
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

    // Post-crawl analysis
    const seoAnalysis = analyzeSEO(results);
    console.log(`  ✅  SEO analysis: ${seoAnalysis.summary.totalIssues} issues found`);

    const sitemapComparison = sitemapUrls.length > 0
        ? compareSitemap(sitemapUrls, results)
        : null;

    await markCompleted(domain, scanId);

    // Write results
    const extras = { seoAnalysis, sitemapComparison };
    const resultsDir = await writeResults(domain, scanId, results, startUrls, extras);

    // Generate HTML report
    const reportPath = await generateReport(resultsDir, {
        pages: results,
        seoAnalysis,
        sitemapComparison,
        domain,
        scanId,
    });

    printSummary(results, resultsDir, extras);

    // Assertions
    const pages = Object.values(results);
    const mainPage = pages.find((p) => p.url.includes('example.com') && p.type === 'internal');

    if (pages.length === 0) { fail('No pages crawled'); }
    if (!mainPage) { fail('Main page not found'); }
    if (mainPage.status !== 200) { fail(`Expected status 200, got ${mainPage.status}`); }
    if (!mainPage.metadata?.title) { fail('Title not extracted'); }

    // Verify new Phase 2 data
    if (mainPage.redirectChain === undefined) { fail('redirectChain missing from result'); }
    if (mainPage.security === undefined) { fail('security headers missing from result'); }
    if (mainPage.contentLength === undefined) { fail('contentLength missing from result'); }

    // Verify files exist
    const csv = await readFile(`${resultsDir}/pages.csv`, 'utf-8');
    if (!csv.includes('URL')) { fail('CSV file missing header row'); }

    const report = await readFile(reportPath, 'utf-8');
    if (!report.includes('webaudit')) { fail('HTML report missing content'); }
    if (!report.includes('seoContent')) { fail('HTML report missing SEO section'); }

    console.log(`  ✅  Crawled ${pages.length} page(s)`);
    console.log(`  ✅  Status: ${mainPage.status}`);
    console.log(`  ✅  Title: "${mainPage.metadata.title}"`);
    console.log(`  ✅  Redirect chain: ${mainPage.redirectChain.length} hops`);
    console.log(`  ✅  Security headers: ${mainPage.security.present.length} present, ${mainPage.security.missing.length} missing`);
    console.log(`  ✅  Content length: ${mainPage.contentLength} bytes`);
    console.log(`  ✅  CSV export: ${csv.split('\n').length} rows`);
    console.log(`  ✅  HTML report: ${(report.length / 1024).toFixed(1)} KB`);
    console.log(`  ✅  SEO issues: ${seoAnalysis.summary.totalIssues}`);
    console.log('\n  🎉  All Phase 2 smoke test assertions passed!\n');
} catch (err) {
    dashboard.stop();
    console.error(`\n  ❌ FAIL: ${err.message}\n`);
    console.error(err.stack);
    process.exit(1);
}

function fail(msg) {
    console.error(`  ❌ FAIL: ${msg}`);
    process.exit(1);
}
