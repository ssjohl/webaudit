/**
 * HTML parser — extracts SEO metadata, links, and mixed content from a page.
 */

import * as cheerio from 'cheerio';

/**
 * Parse an HTML body and extract metadata + links + mixed content.
 * @param {string} html - The HTML content
 * @param {string} pageUrl - The URL of the page (for resolving relative links)
 * @returns {{ metadata, links }}
 */
export function parsePage(html, pageUrl) {
    const $ = cheerio.load(html);
    const isHttps = pageUrl.startsWith('https://');

    const metadata = {
        title: $('title').first().text().trim() || null,
        metaDescription: $('meta[name="description"]').attr('content')?.trim() || null,
        metaKeywords: $('meta[name="keywords"]').attr('content')?.trim() || null,
        headings: extractHeadings($),
        images: extractImages($),
        canonical: $('link[rel="canonical"]').attr('href') || null,
        alternates: $('link[rel="alternate"]')
            .map((_, el) => ({
                href: $(el).attr('href'),
                hreflang: $(el).attr('hreflang') || null,
                type: $(el).attr('type') || null,
            }))
            .get(),
        stylesheets: $('link[rel="stylesheet"]')
            .map((_, el) => $(el).attr('href'))
            .get()
            .filter(Boolean),
        scripts: $('script[src]')
            .map((_, el) => $(el).attr('src'))
            .get()
            .filter(Boolean),
        mixedContent: isHttps ? detectMixedContent($, pageUrl) : [],
    };

    const links = extractLinks($, pageUrl);

    return { metadata, links };
}

/**
 * Extract all heading tags (h1-h6) and their text content.
 */
function extractHeadings($) {
    const headings = {};
    for (let level = 1; level <= 6; level++) {
        const tag = `h${level}`;
        const items = $(tag)
            .map((_, el) => $(el).text().trim())
            .get()
            .filter((t) => t.length > 0);
        if (items.length > 0) {
            headings[tag] = items;
        }
    }
    return headings;
}

/**
 * Extract all images with their src and alt attributes.
 */
function extractImages($) {
    return $('img')
        .map((_, el) => ({
            src: $(el).attr('src') || null,
            alt: $(el).attr('alt') ?? null,
        }))
        .get()
        .filter((img) => img.src);
}

/**
 * Extract all anchor links with href, rel, and link text.
 */
function extractLinks($, pageUrl) {
    const links = [];

    $('a[href]').each((_, el) => {
        const href = $(el).attr('href')?.trim();
        if (!href) return;

        // Skip javascript:, mailto:, tel:, data: links
        if (/^(javascript|mailto|tel|data):/i.test(href)) return;

        let resolved;
        try {
            resolved = new URL(href, pageUrl).toString();
        } catch {
            return;
        }

        links.push({
            href,
            resolved,
            rel: $(el).attr('rel') || null,
            text: $(el).text().trim().substring(0, 200),
        });
    });

    return links;
}

/**
 * Detect mixed content on HTTPS pages.
 * Checks img, script, link[stylesheet], iframe, video, audio, source, embed, object.
 */
function detectMixedContent($, pageUrl) {
    const mixed = [];

    const selectors = [
        { sel: 'img[src]', attr: 'src', type: 'image' },
        { sel: 'script[src]', attr: 'src', type: 'script' },
        { sel: 'link[rel="stylesheet"][href]', attr: 'href', type: 'stylesheet' },
        { sel: 'iframe[src]', attr: 'src', type: 'iframe' },
        { sel: 'video[src]', attr: 'src', type: 'video' },
        { sel: 'audio[src]', attr: 'src', type: 'audio' },
        { sel: 'source[src]', attr: 'src', type: 'media-source' },
        { sel: 'embed[src]', attr: 'src', type: 'embed' },
        { sel: 'object[data]', attr: 'data', type: 'object' },
    ];

    for (const { sel, attr, type } of selectors) {
        $(sel).each((_, el) => {
            const url = $(el).attr(attr);
            if (url && url.startsWith('http://')) {
                mixed.push({ type, url });
            } else if (url && !url.startsWith('https://') && !url.startsWith('//') && !url.startsWith('/') && !url.startsWith('data:')) {
                // Resolve relative URLs to check
                try {
                    const resolved = new URL(url, pageUrl);
                    if (resolved.protocol === 'http:') {
                        mixed.push({ type, url: resolved.toString() });
                    }
                } catch { /* ignore */ }
            }
        });
    }

    return mixed;
}
