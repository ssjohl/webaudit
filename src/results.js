/**
 * Write scan results to disk and print terminal summary.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getScanDir } from './state.js';

/**
 * Write all results to the scan's results directory.
 * Creates per-path subfolders with pages.json, broken-links.json, and summary.json.
 */
export async function writeResults(domain, scanId, results, startUrls) {
    const scanDir = getScanDir(domain, scanId);
    const resultsDir = join(scanDir, 'results');
    await mkdir(resultsDir, { recursive: true });

    // Group results by start path
    const grouped = groupByStartPath(results, startUrls);

    for (const [pathKey, pages] of Object.entries(grouped)) {
        const pathDir = join(resultsDir, sanitizePath(pathKey));
        await mkdir(pathDir, { recursive: true });

        // pages.json
        await writeFile(
            join(pathDir, 'pages.json'),
            JSON.stringify(pages, null, 2),
            'utf-8'
        );

        // broken-links.json
        const brokenLinks = buildBrokenLinksReport(pages);
        await writeFile(
            join(pathDir, 'broken-links.json'),
            JSON.stringify(brokenLinks, null, 2),
            'utf-8'
        );

        // summary.json
        const summary = buildSummary(pages);
        await writeFile(
            join(pathDir, 'summary.json'),
            JSON.stringify(summary, null, 2),
            'utf-8'
        );
    }

    return resultsDir;
}

/**
 * Group page results by the start URL path they belong to.
 */
function groupByStartPath(results, startUrls) {
    // If only one start URL, put everything under its path
    if (startUrls.length <= 1) {
        const pathKey = startUrls.length === 1
            ? new URL(startUrls[0]).pathname
            : '/';
        return { [pathKey]: Object.values(results) };
    }

    const groups = {};
    const paths = startUrls.map((u) => {
        const p = new URL(u).pathname.replace(/\/+$/, '') || '/';
        groups[p] = [];
        return p;
    });

    for (const page of Object.values(results)) {
        try {
            const pagePath = new URL(page.url).pathname;
            // Find the most specific start path that matches
            const match = paths
                .filter((p) => p === '/' || pagePath.startsWith(p))
                .sort((a, b) => b.length - a.length)[0];
            if (match) {
                groups[match].push(page);
            } else {
                // Shouldn't happen, but put in first group
                groups[paths[0]].push(page);
            }
        } catch {
            groups[paths[0]].push(page);
        }
    }

    return groups;
}

/**
 * Build a broken links report: { url, status, linkedFrom[] }
 */
function buildBrokenLinksReport(pages) {
    const broken = [];
    for (const page of pages) {
        if (page.status >= 400 || page.status === 0) {
            broken.push({
                url: page.url,
                status: page.status,
                error: page.error || null,
                linkedFrom: page.linkedFrom || [],
            });
        }
    }
    return broken;
}

/**
 * Build a summary object for a set of pages.
 */
function buildSummary(pages) {
    const internal = pages.filter((p) => p.type === 'internal');
    const external = pages.filter((p) => p.type === 'external');
    const broken = pages.filter((p) => p.status >= 400 || p.status === 0);
    const htmlPages = internal.filter((p) => p.mimeType?.includes('html'));
    const avgLoadTime =
        htmlPages.length > 0
            ? Math.round(htmlPages.reduce((sum, p) => sum + (p.loadTimeMs || 0), 0) / htmlPages.length)
            : 0;

    return {
        totalPages: pages.length,
        internalPages: internal.length,
        externalLinks: external.length,
        brokenLinks: broken.length,
        htmlPages: htmlPages.length,
        avgLoadTimeMs: avgLoadTime,
        robotsDisallowed: pages.filter((p) => p.robotsDisallowed).length,
        scannedAt: new Date().toISOString(),
    };
}

/**
 * Sanitize a path for use as a folder name.
 */
function sanitizePath(urlPath) {
    if (urlPath === '/') return '_root';
    return urlPath.replace(/^\//, '').replace(/\//g, '_').replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Print a human-readable summary to the terminal.
 */
export function printSummary(results, resultsDir) {
    const pages = Object.values(results);
    const internal = pages.filter((p) => p.type === 'internal');
    const external = pages.filter((p) => p.type === 'external');
    const broken = pages.filter((p) => p.status >= 400 || p.status === 0);
    const htmlPages = internal.filter((p) => p.mimeType?.includes('html'));

    console.log('\n' + '═'.repeat(60));
    console.log('  📊  SCAN COMPLETE');
    console.log('═'.repeat(60));
    console.log(`  📄  Total pages discovered:  ${pages.length}`);
    console.log(`  🏠  Internal pages:          ${internal.length} (${htmlPages.length} HTML)`);
    console.log(`  🌐  External links checked:  ${external.length}`);
    console.log(`  ❌  Broken links:            ${broken.length}`);
    console.log(`  🚫  Robots disallowed:       ${pages.filter((p) => p.robotsDisallowed).length}`);

    if (htmlPages.length > 0) {
        const avg = Math.round(htmlPages.reduce((s, p) => s + (p.loadTimeMs || 0), 0) / htmlPages.length);
        console.log(`  ⚡  Avg load time:           ${avg}ms`);
    }

    console.log(`\n  📁  Results saved to:\n      ${resultsDir}`);

    if (broken.length > 0) {
        console.log('\n  ❌  Broken Links:');
        for (const b of broken.slice(0, 20)) {
            console.log(`      [${b.status || 'ERR'}] ${b.url}`);
            if (b.linkedFrom?.length > 0) {
                console.log(`           ← linked from: ${b.linkedFrom[0]}`);
            }
        }
        if (broken.length > 20) {
            console.log(`      ... and ${broken.length - 20} more (see broken-links.json)`);
        }
    }

    console.log('═'.repeat(60) + '\n');
}
