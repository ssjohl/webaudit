/**
 * URL normalisation, scope checking, and parameter stripping utilities.
 */

/**
 * Parse a URL string into { domain, path }.
 */
export function parseDomainAndPath(urlStr) {
    const u = new URL(urlStr);
    return {
        domain: u.hostname,
        path: u.pathname.replace(/\/+$/, '') || '/',
    };
}

/**
 * Normalise a URL: strip hash, remove ignorable query params, sort remaining,
 * normalise trailing slashes, lowercase scheme + host.
 */
export function normaliseUrl(urlStr, ignorableParams = []) {
    const u = new URL(urlStr);
    u.hash = '';

    const ignoreSet = new Set(ignorableParams.map((p) => p.toLowerCase()));
    const params = new URLSearchParams();

    // Sort params and filter out ignorable ones
    const entries = [...u.searchParams.entries()]
        .filter(([key]) => !ignoreSet.has(key.toLowerCase()))
        .sort(([a], [b]) => a.localeCompare(b));

    for (const [key, value] of entries) {
        params.append(key, value);
    }

    u.search = params.toString() ? `?${params.toString()}` : '';

    // Normalise path: remove trailing slash (except root)
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
        u.pathname = u.pathname.replace(/\/+$/, '');
    }

    return u.toString();
}

/**
 * Check if a URL is within scope of a start path.
 * A URL is in scope if its path starts with the start path.
 */
export function isInScope(urlStr, startPath) {
    const u = new URL(urlStr);
    const normPath = u.pathname.replace(/\/+$/, '') || '/';
    const normStart = startPath.replace(/\/+$/, '') || '/';

    if (normStart === '/') return true;
    return normPath === normStart || normPath.startsWith(normStart + '/');
}

/**
 * Resolve a relative URL against a base URL.
 */
export function resolveUrl(base, relative) {
    try {
        return new URL(relative, base).toString();
    } catch {
        return null;
    }
}

/**
 * Check if a URL belongs to the same domain.
 */
export function isSameDomain(urlStr, domain) {
    try {
        const u = new URL(urlStr);
        return u.hostname.toLowerCase() === domain.toLowerCase();
    } catch {
        return false;
    }
}

/**
 * Parse a comma-and-space-separated string of URLs into an array.
 */
export function parseStartUrls(input) {
    if (Array.isArray(input)) return input;
    return input
        .split(/[\s,]+/)
        .map((u) => u.trim())
        .filter((u) => u.length > 0);
}
