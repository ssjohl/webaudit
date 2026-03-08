/**
 * Write scan results to disk and print terminal summary.
 * Outputs: pages.json, broken-links.json, summary.json, pages.csv, seo-issues.json, sitemap-comparison.json
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getScanDir } from './state.js';

/**
 * Write all results to the scan's results directory.
 */
export async function writeResults(domain, scanId, results, startUrls, extras = {}) {
    const scanDir = getScanDir(domain, scanId);
    const resultsDir = join(scanDir, 'results');
    await mkdir(resultsDir, { recursive: true });

    const pages = Object.values(results);

    // pages.json
    await writeFile(join(resultsDir, 'pages.json'), JSON.stringify(pages, null, 2), 'utf-8');

    // pages.csv
    await writeFile(join(resultsDir, 'pages.csv'), buildCSV(pages), 'utf-8');

    // broken-links.json
    const brokenLinks = buildBrokenLinksReport(pages);
    await writeFile(join(resultsDir, 'broken-links.json'), JSON.stringify(brokenLinks, null, 2), 'utf-8');

    // redirect-chains.json
    const redirects = buildRedirectReport(pages);
    await writeFile(join(resultsDir, 'redirect-chains.json'), JSON.stringify(redirects, null, 2), 'utf-8');

    // seo-issues.json
    if (extras.seoAnalysis) {
        await writeFile(join(resultsDir, 'seo-issues.json'), JSON.stringify(extras.seoAnalysis, null, 2), 'utf-8');
    }

    // sitemap-comparison.json
    if (extras.sitemapComparison) {
        await writeFile(join(resultsDir, 'sitemap-comparison.json'), JSON.stringify(extras.sitemapComparison, null, 2), 'utf-8');
    }

    // security-report.json
    const securityReport = buildSecurityReport(pages);
    await writeFile(join(resultsDir, 'security-report.json'), JSON.stringify(securityReport, null, 2), 'utf-8');

    // summary.json
    const summary = buildSummary(pages, extras);
    await writeFile(join(resultsDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');

    return resultsDir;
}

/**
 * Build CSV output.
 */
function buildCSV(pages) {
    const headers = [
        'URL', 'Status', 'MIME Type', 'Load Time (ms)', 'Size (bytes)',
        'Title', 'Meta Description', 'H1', 'Broken', 'Robots Disallowed',
        'Redirect Chain', 'Redirect Loop', 'Type', 'Depth',
        'Missing Security Headers', 'Mixed Content Count',
    ];

    const rows = pages.map((p) => [
        csvEscape(p.url),
        p.status || '',
        csvEscape(p.mimeType || ''),
        p.loadTimeMs || '',
        p.contentLength || '',
        csvEscape(p.metadata?.title || ''),
        csvEscape(p.metadata?.metaDescription || ''),
        csvEscape((p.metadata?.headings?.h1 || []).join(' | ')),
        (p.status >= 400 || p.status === 0) ? 'YES' : '',
        p.robotsDisallowed ? 'YES' : '',
        (p.redirectChain?.length || 0) > 0 ? p.redirectChain.map((r) => `${r.status}→${r.location}`).join(' → ') : '',
        p.redirectLoop ? 'YES' : '',
        p.type || '',
        p.depth ?? '',
        p.security?.missing?.join(', ') || '',
        p.metadata?.mixedContent?.length || '',
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * Escape a value for CSV.
 */
function csvEscape(value) {
    if (!value) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/**
 * Build a broken links report.
 */
function buildBrokenLinksReport(pages) {
    return pages
        .filter((p) => p.status >= 400 || p.status === 0)
        .map((p) => ({
            url: p.url,
            status: p.status,
            error: p.error || null,
            type: p.type,
            linkedFrom: p.linkedFrom || [],
        }));
}

/**
 * Build a redirect chains report.
 */
function buildRedirectReport(pages) {
    return pages
        .filter((p) => p.redirectChain?.length > 0)
        .map((p) => ({
            url: p.url,
            finalUrl: p.finalUrl,
            chain: p.redirectChain,
            isLoop: p.redirectLoop || false,
            hops: p.redirectChain.length,
        }));
}

/**
 * Build a security report.
 */
function buildSecurityReport(pages) {
    const pagesWithIssues = pages
        .filter((p) => p.security?.missing?.length > 0)
        .map((p) => ({
            url: p.url,
            missing: p.security.missing,
            present: p.security.present,
        }));

    // Aggregate: which headers are most commonly missing
    const headerCounts = {};
    for (const p of pagesWithIssues) {
        for (const h of p.missing) {
            headerCounts[h] = (headerCounts[h] || 0) + 1;
        }
    }

    return {
        pagesChecked: pages.filter((p) => p.security).length,
        pagesWithMissingHeaders: pagesWithIssues.length,
        headerCounts,
        pages: pagesWithIssues,
    };
}

/**
 * Build a summary object.
 */
function buildSummary(pages, extras = {}) {
    const internal = pages.filter((p) => p.type === 'internal');
    const external = pages.filter((p) => p.type === 'external');
    const broken = pages.filter((p) => p.status >= 400 || p.status === 0);
    const htmlPages = internal.filter((p) => p.mimeType?.includes('html'));
    const avgLoadTime =
        htmlPages.length > 0
            ? Math.round(htmlPages.reduce((sum, p) => sum + (p.loadTimeMs || 0), 0) / htmlPages.length)
            : 0;
    const redirects = pages.filter((p) => p.redirectChain?.length > 0);
    const loops = pages.filter((p) => p.redirectLoop);

    const summary = {
        totalPages: pages.length,
        internalPages: internal.length,
        externalLinks: external.length,
        brokenLinks: broken.length,
        htmlPages: htmlPages.length,
        avgLoadTimeMs: avgLoadTime,
        robotsDisallowed: pages.filter((p) => p.robotsDisallowed).length,
        redirectChains: redirects.length,
        redirectLoops: loops.length,
        scannedAt: new Date().toISOString(),
    };

    if (extras.seoAnalysis?.summary) {
        summary.seo = extras.seoAnalysis.summary;
    }

    if (extras.sitemapComparison) {
        summary.sitemap = {
            orphanPages: extras.sitemapComparison.orphanPages.length,
            unindexedPages: extras.sitemapComparison.unindexedPages.length,
        };
    }

    return summary;
}

/**
 * Print a human-readable summary to the terminal.
 */
export function printSummary(results, resultsDir, extras = {}) {
    const pages = Object.values(results);
    const internal = pages.filter((p) => p.type === 'internal');
    const external = pages.filter((p) => p.type === 'external');
    const broken = pages.filter((p) => p.status >= 400 || p.status === 0);
    const htmlPages = internal.filter((p) => p.mimeType?.includes('html'));
    const redirects = pages.filter((p) => p.redirectChain?.length > 0);
    const loops = pages.filter((p) => p.redirectLoop);

    console.log('\n' + '═'.repeat(60));
    console.log('  📊  SCAN COMPLETE');
    console.log('═'.repeat(60));
    console.log(`  📄  Total pages discovered:  ${pages.length}`);
    console.log(`  🏠  Internal pages:          ${internal.length} (${htmlPages.length} HTML)`);
    console.log(`  🌐  External links checked:  ${external.length}`);
    console.log(`  ❌  Broken links:            ${broken.length}`);
    console.log(`  🚫  Robots disallowed:       ${pages.filter((p) => p.robotsDisallowed).length}`);
    console.log(`  🔀  Redirect chains:         ${redirects.length}${loops.length > 0 ? ` (${loops.length} loops!)` : ''}`);

    if (htmlPages.length > 0) {
        const avg = Math.round(htmlPages.reduce((s, p) => s + (p.loadTimeMs || 0), 0) / htmlPages.length);
        console.log(`  ⚡  Avg load time:           ${avg}ms`);
    }

    if (extras.seoAnalysis?.summary) {
        const seo = extras.seoAnalysis.summary;
        console.log(`  🔍  SEO issues:              ${seo.totalIssues} (${seo.errors} errors, ${seo.warnings} warnings)`);
    }

    if (extras.sitemapComparison) {
        const sm = extras.sitemapComparison;
        console.log(`  🗺️   Sitemap orphans:         ${sm.orphanPages.length} | Unindexed: ${sm.unindexedPages.length}`);
    }

    console.log(`\n  📁  Results saved to:\n      ${resultsDir}`);

    if (broken.length > 0) {
        console.log('\n  ❌  Broken Links:');
        for (const b of broken.slice(0, 10)) {
            console.log(`      [${b.status || 'ERR'}] ${b.url}`);
            if (b.linkedFrom?.length > 0) {
                console.log(`           ← linked from: ${b.linkedFrom[0]}`);
            }
        }
        if (broken.length > 10) {
            console.log(`      ... and ${broken.length - 10} more (see broken-links.json)`);
        }
    }

    console.log('═'.repeat(60) + '\n');
}
