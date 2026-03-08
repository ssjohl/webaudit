/**
 * Post-crawl SEO analysis.
 * Runs over collected results to flag common SEO issues.
 */

/**
 * Analyze all crawled pages for SEO issues.
 * @param {Object} results - Map of normalised URL → page result
 * @returns {{ issues: Object[], summary: Object }}
 */
export function analyzeSEO(results) {
    const pages = Object.values(results).filter(
        (p) => p.type === 'internal' && p.metadata
    );

    const issues = [];

    // Track duplicates
    const titles = new Map();      // title → [urls]
    const descriptions = new Map(); // desc → [urls]

    for (const page of pages) {
        const pageIssues = [];
        const { metadata, url } = page;

        // --- Title checks ---
        if (!metadata.title) {
            pageIssues.push({ type: 'missing-title', severity: 'error', message: 'Missing <title> tag' });
        } else {
            const len = metadata.title.length;
            if (len < 30) {
                pageIssues.push({ type: 'short-title', severity: 'warning', message: `Title too short (${len} chars, recommended 30-60)` });
            } else if (len > 60) {
                pageIssues.push({ type: 'long-title', severity: 'warning', message: `Title too long (${len} chars, recommended 30-60)` });
            }
            // Track for duplicates
            const arr = titles.get(metadata.title) || [];
            arr.push(url);
            titles.set(metadata.title, arr);
        }

        // --- Meta description checks ---
        if (!metadata.metaDescription) {
            pageIssues.push({ type: 'missing-description', severity: 'error', message: 'Missing meta description' });
        } else {
            const len = metadata.metaDescription.length;
            if (len < 70) {
                pageIssues.push({ type: 'short-description', severity: 'warning', message: `Meta description too short (${len} chars, recommended 70-160)` });
            } else if (len > 160) {
                pageIssues.push({ type: 'long-description', severity: 'warning', message: `Meta description too long (${len} chars, recommended 70-160)` });
            }
            const arr = descriptions.get(metadata.metaDescription) || [];
            arr.push(url);
            descriptions.set(metadata.metaDescription, arr);
        }

        // --- Heading hierarchy checks ---
        const { headings } = metadata;
        if (!headings.h1 || headings.h1.length === 0) {
            pageIssues.push({ type: 'missing-h1', severity: 'error', message: 'Missing <h1> tag' });
        } else if (headings.h1.length > 1) {
            pageIssues.push({ type: 'multiple-h1', severity: 'warning', message: `Multiple <h1> tags (${headings.h1.length})` });
        }

        // Check for skipped heading levels
        const levels = [];
        for (let i = 1; i <= 6; i++) {
            if (headings[`h${i}`]?.length > 0) levels.push(i);
        }
        for (let i = 1; i < levels.length; i++) {
            if (levels[i] - levels[i - 1] > 1) {
                pageIssues.push({
                    type: 'skipped-heading',
                    severity: 'warning',
                    message: `Skipped heading level: <h${levels[i - 1]}> → <h${levels[i]}>`,
                });
                break;
            }
        }

        // --- Image alt checks ---
        if (metadata.images) {
            const missingAlt = metadata.images.filter((img) => img.alt === null || img.alt === '');
            if (missingAlt.length > 0) {
                pageIssues.push({
                    type: 'missing-alt',
                    severity: 'warning',
                    message: `${missingAlt.length} image(s) missing alt text`,
                    details: missingAlt.map((img) => img.src),
                });
            }
        }

        // --- Mixed content ---
        if (metadata.mixedContent?.length > 0) {
            pageIssues.push({
                type: 'mixed-content',
                severity: 'error',
                message: `${metadata.mixedContent.length} mixed content resource(s)`,
                details: metadata.mixedContent,
            });
        }

        if (pageIssues.length > 0) {
            issues.push({ url, issues: pageIssues });
        }
    }

    // --- Duplicate checks (cross-page) ---
    const duplicateIssues = [];
    for (const [title, urls] of titles) {
        if (urls.length > 1) {
            duplicateIssues.push({
                type: 'duplicate-title',
                severity: 'warning',
                message: `Duplicate title: "${title.substring(0, 80)}"`,
                urls,
            });
        }
    }
    for (const [desc, urls] of descriptions) {
        if (urls.length > 1) {
            duplicateIssues.push({
                type: 'duplicate-description',
                severity: 'warning',
                message: `Duplicate meta description (${desc.substring(0, 60)}...)`,
                urls,
            });
        }
    }

    // Summary counts
    const allIssues = issues.flatMap((p) => p.issues);
    const summary = {
        pagesWithIssues: issues.length,
        totalIssues: allIssues.length,
        errors: allIssues.filter((i) => i.severity === 'error').length,
        warnings: allIssues.filter((i) => i.severity === 'warning').length,
        duplicateTitles: duplicateIssues.filter((i) => i.type === 'duplicate-title').length,
        duplicateDescriptions: duplicateIssues.filter((i) => i.type === 'duplicate-description').length,
    };

    return { issues, duplicateIssues, summary };
}
