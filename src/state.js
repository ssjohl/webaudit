/**
 * Scan state persistence for resume support.
 * State files: ~/.webaudit/projects/<domain>/scans/<scanId>/state.json
 */

import { readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { getProjectDir } from './config.js';

/**
 * Get the scans directory for a domain.
 */
function getScansDir(domain) {
    return join(getProjectDir(domain), 'scans');
}

/**
 * Get the directory for a specific scan.
 */
export function getScanDir(domain, scanId) {
    return join(getScansDir(domain), scanId);
}

/**
 * Generate a scan ID from current timestamp.
 */
export function generateScanId() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * Save scan state to disk (atomic write via temp file + rename).
 */
export async function saveState(domain, scanId, state) {
    const dir = getScanDir(domain, scanId);
    await mkdir(dir, { recursive: true });

    const statePath = join(dir, 'state.json');
    const tmpPath = join(dir, 'state.tmp.json');

    const data = {
        scanId,
        ...state,
        updatedAt: new Date().toISOString(),
    };

    await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    await rename(tmpPath, statePath);
}

/**
 * Load state for a specific scan.
 */
export async function loadState(domain, scanId) {
    try {
        const statePath = join(getScanDir(domain, scanId), 'state.json');
        const data = await readFile(statePath, 'utf-8');
        return JSON.parse(data);
    } catch {
        return null;
    }
}

/**
 * Find the most recent in-progress scan for a domain.
 * Returns { scanId, state } or null.
 */
export async function findResumableScan(domain) {
    const scansDir = getScansDir(domain);

    let entries;
    try {
        entries = await readdir(scansDir);
    } catch {
        return null;
    }

    // Sort descending (most recent first)
    entries.sort().reverse();

    for (const scanId of entries) {
        const state = await loadState(domain, scanId);
        if (state && state.status === 'in-progress') {
            return { scanId, state };
        }
    }

    return null;
}

/**
 * Mark a scan as completed.
 */
export async function markCompleted(domain, scanId) {
    const state = await loadState(domain, scanId);
    if (state) {
        state.status = 'completed';
        await saveState(domain, scanId, state);
    }
}
