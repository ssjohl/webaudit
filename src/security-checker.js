/**
 * Security headers checker.
 * Validates presence of important security headers on each page.
 */

const SECURITY_HEADERS = [
    'content-security-policy',
    'strict-transport-security',
    'x-frame-options',
    'x-content-type-options',
    'referrer-policy',
    'permissions-policy',
];

/**
 * Check response headers for security best practices.
 * @param {Object} headers - Response headers (lowercase keys)
 * @returns {{ missing: string[], present: string[] }}
 */
export function checkSecurityHeaders(headers) {
    if (!headers) return { missing: [...SECURITY_HEADERS], present: [] };

    // Normalise header keys to lowercase
    const normalised = {};
    for (const [key, value] of Object.entries(headers)) {
        normalised[key.toLowerCase()] = value;
    }

    const missing = [];
    const present = [];

    for (const header of SECURITY_HEADERS) {
        if (normalised[header]) {
            present.push(header);
        } else {
            missing.push(header);
        }
    }

    return { missing, present };
}
