/**
 * CLI orchestrator — argument parsing, interactive prompts, scan lifecycle.
 */

import inquirer from 'inquirer';
import { parseStartUrls, parseDomainAndPath, normaliseUrl } from './url-utils.js';
import { loadProjectConfig, saveProjectConfig, getDefaultConfig } from './config.js';
import { loadRobotsTxt } from './robots.js';
import { saveState, findResumableScan, generateScanId, markCompleted } from './state.js';
import { crawl } from './crawler.js';
import { Dashboard } from './dashboard.js';
import { writeResults, printSummary } from './results.js';
import { analyzeSEO } from './seo-analyzer.js';
import { fetchSitemap, compareSitemap } from './sitemap.js';
import { generateReport } from './report.js';

/**
 * Main entry point.
 */
export async function run(args) {
    // Parse start URLs from args
    const rawUrls = args.join(' ');

    if (!rawUrls.trim()) {
        console.log('\n  Usage: webaudit <url> [url2] [url3] ...\n');
        console.log('  Examples:');
        console.log('    webaudit https://example.com');
        console.log('    webaudit https://example.com/blog https://example.com/docs');
        console.log('    webaudit https://example.com/blog,https://example.com/docs\n');
        process.exit(1);
    }

    const startUrls = parseStartUrls(rawUrls);

    // Validate URLs
    for (const url of startUrls) {
        try {
            new URL(url);
        } catch {
            console.error(`\n  ❌ Invalid URL: ${url}\n`);
            process.exit(1);
        }
    }

    // All start URLs must be on the same domain
    const domains = [...new Set(startUrls.map((u) => parseDomainAndPath(u).domain))];
    if (domains.length > 1) {
        console.error(`\n  ❌ All start URLs must be on the same domain. Found: ${domains.join(', ')}\n`);
        process.exit(1);
    }

    const domain = domains[0];
    const startPaths = startUrls.map((u) => parseDomainAndPath(u).path);
    const scheme = new URL(startUrls[0]).protocol.replace(':', '');

    console.log(`\n  🌐  Domain: ${domain}`);
    console.log(`  📂  Paths:  ${startPaths.join(', ')}\n`);

    // Load or create project config
    let config = await loadProjectConfig(domain);
    const isExisting = config !== null;

    if (isExisting) {
        console.log('  📋  Found existing project config for this domain.\n');
    }

    config = await promptConfig(config, isExisting);
    await saveProjectConfig(domain, config);

    // Check for resumable scan
    let scanId;
    let resumeState = null;
    const resumable = await findResumableScan(domain);

    if (resumable) {
        const { resume } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'resume',
                message: `Found an unfinished scan (${resumable.scanId}). Resume it?`,
                default: true,
            },
        ]);

        if (resume) {
            scanId = resumable.scanId;
            resumeState = resumable.state;
            console.log(`\n  ♻️  Resuming scan ${scanId}...\n`);
        } else {
            scanId = generateScanId();
        }
    } else {
        scanId = generateScanId();
    }

    // Fetch robots.txt
    console.log('  🤖  Fetching robots.txt...');
    const robots = await loadRobotsTxt(domain, scheme);
    console.log('  ✅  robots.txt loaded.');

    // Fetch sitemap
    console.log('  🗺️   Fetching sitemap.xml...');
    const sitemapUrls = await fetchSitemap(domain, scheme);
    console.log(`  ✅  Sitemap: ${sitemapUrls.length} URLs found.\n`);

    // Set up dashboard
    const dashboard = new Dashboard();
    dashboard.start(domain, startPaths[0]);

    // SIGINT handler
    let interrupted = false;
    const sigintHandler = async () => {
        if (interrupted) {
            console.log('\n  ⚠️  Force quitting...\n');
            process.exit(1);
        }
        interrupted = true;
        dashboard.stop();
        console.log('\n\n  ⏸️  Interrupted! Saving scan state...');

        crawl.stop?.();
        const state = crawl.getState?.() || { status: 'in-progress', results: {} };
        await saveState(domain, scanId, state);
        console.log(`  💾  State saved. Resume later with the same command.\n`);
        process.exit(0);
    };

    process.on('SIGINT', sigintHandler);
    process.on('SIGTERM', sigintHandler);

    // Run the crawl
    const normStartUrls = startUrls.map((u) => normaliseUrl(u, config.ignorableParams));

    try {
        const results = await crawl({
            startUrls: normStartUrls,
            domain,
            startPaths,
            config,
            robots,
            dashboard,
            resumeState,
        });

        dashboard.stop();

        // Post-crawl analysis
        console.log('\n  🔍  Running SEO analysis...');
        const seoAnalysis = analyzeSEO(results);

        let sitemapComparison = null;
        if (sitemapUrls.length > 0) {
            console.log('  🗺️   Comparing with sitemap...');
            sitemapComparison = compareSitemap(sitemapUrls, results);
        }

        // Save state as completed
        await markCompleted(domain, scanId);

        // Write results (JSON, CSV, reports)
        const extras = { seoAnalysis, sitemapComparison };
        const resultsDir = await writeResults(domain, scanId, results, startUrls, extras);

        // Generate HTML report
        console.log('  📊  Generating HTML report...');
        const reportPath = await generateReport(resultsDir, {
            pages: results,
            seoAnalysis,
            sitemapComparison,
            domain,
            scanId,
        });
        console.log(`  ✅  Report: ${reportPath}`);

        printSummary(results, resultsDir, extras);
    } catch (err) {
        dashboard.stop();
        console.error(`\n  ❌  Crawl failed: ${err.message}\n`);

        try {
            const state = crawl.getState?.() || { status: 'in-progress', results: {} };
            await saveState(domain, scanId, state);
            console.log('  💾  Partial state saved. You can resume later.\n');
        } catch {
            // State save failed
        }

        process.exit(1);
    } finally {
        process.removeListener('SIGINT', sigintHandler);
        process.removeListener('SIGTERM', sigintHandler);
    }
}

/**
 * Prompt user for configuration.
 */
async function promptConfig(existingConfig, isExisting) {
    const defaults = { ...getDefaultConfig(), ...(existingConfig || {}) };

    const answers = await inquirer.prompt([
        {
            type: 'number',
            name: 'concurrency',
            message: 'Concurrent requests:',
            default: defaults.concurrency,
            validate: (v) => (v > 0 && v <= 50 ? true : 'Must be between 1 and 50'),
        },
        {
            type: 'number',
            name: 'rateLimit',
            message: 'Delay between requests (ms):',
            default: defaults.rateLimit,
            validate: (v) => (v >= 0 ? true : 'Must be >= 0'),
        },
        {
            type: 'number',
            name: 'maxDepth',
            message: 'Maximum crawl depth:',
            default: defaults.maxDepth,
            validate: (v) => (v > 0 ? true : 'Must be > 0'),
        },
        {
            type: 'number',
            name: 'maxRedirects',
            message: 'Maximum redirect hops:',
            default: defaults.maxRedirects,
            validate: (v) => (v > 0 ? true : 'Must be > 0'),
        },
        {
            type: 'number',
            name: 'timeout',
            message: 'Request timeout (ms):',
            default: defaults.timeout,
            validate: (v) => (v >= 1000 ? true : 'Must be >= 1000'),
        },
        {
            type: 'input',
            name: 'ignorableParams',
            message: 'Ignorable query parameters (comma-separated):',
            default: (defaults.ignorableParams || []).join(', '),
            filter: (v) =>
                v
                    .split(',')
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0),
        },
        {
            type: 'input',
            name: 'blockedDomains',
            message: 'Blocked external domains (comma-separated):',
            default: (defaults.blockedDomains || []).join(', '),
            filter: (v) =>
                v
                    .split(',')
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0),
        },
        {
            type: 'input',
            name: 'cookies',
            message: 'Cookies (key=value; key2=value2):',
            default: defaults.cookies || '',
        },
        {
            type: 'input',
            name: 'basicAuth',
            message: 'Basic auth (user:password, leave empty for none):',
            default: defaults.basicAuth || '',
        },
    ]);

    return {
        ...(existingConfig || {}),
        ...answers,
    };
}
