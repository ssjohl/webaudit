/**
 * Fetch and parse robots.txt for a domain.
 */

import robotsParser from 'robots-parser';

/**
 * Load and parse robots.txt for a given domain.
 * @param {string} domain - The domain name
 * @param {string} [scheme='https'] - The URL scheme to use (http or https)
 * Returns an object with an isDisallowed(url) method.
 * If robots.txt is unreachable, returns a permissive parser (nothing disallowed).
 */
export async function loadRobotsTxt(domain, scheme = 'https') {
    const robotsUrl = `${scheme}://${domain}/robots.txt`;

    try {
        const response = await fetch(robotsUrl, {
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            return createPermissiveParser(robotsUrl);
        }

        const body = await response.text();
        return robotsParser(robotsUrl, body);
    } catch {
        // Network error or timeout — be permissive
        return createPermissiveParser(robotsUrl);
    }
}

/**
 * Create a parser that allows everything (used when robots.txt is unavailable).
 */
function createPermissiveParser(robotsUrl) {
    return robotsParser(robotsUrl, '');
}

/**
 * Check if a URL is disallowed by the given robots parser.
 * Uses the default user-agent '*'.
 */
export function isDisallowed(robots, url) {
    return robots.isDisallowed(url, '*') || false;
}
