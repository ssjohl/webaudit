/**
 * Project configuration management.
 * Stores per-domain settings in ~/.webaudit/projects/<domain>/config.json
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const BASE_DIR = join(homedir(), '.webaudit', 'projects');

/**
 * Get the directory path for a domain's project.
 */
export function getProjectDir(domain) {
    return join(BASE_DIR, domain);
}

/**
 * Get the config file path for a domain.
 */
function getConfigPath(domain) {
    return join(getProjectDir(domain), 'config.json');
}

/**
 * Load project config for a domain.
 * Returns null if no config exists yet.
 */
export async function loadProjectConfig(domain) {
    try {
        const data = await readFile(getConfigPath(domain), 'utf-8');
        return JSON.parse(data);
    } catch {
        return null;
    }
}

/**
 * Save project config for a domain.
 */
export async function saveProjectConfig(domain, config) {
    const dir = getProjectDir(domain);
    await mkdir(dir, { recursive: true });

    const data = {
        ...config,
        domain,
        updatedAt: new Date().toISOString(),
    };

    if (!data.createdAt) {
        data.createdAt = data.updatedAt;
    }

    await writeFile(getConfigPath(domain), JSON.stringify(data, null, 2), 'utf-8');
    return data;
}

/**
 * Default configuration values.
 */
export function getDefaultConfig() {
    return {
        concurrency: 5,
        rateLimit: 200,
        maxDepth: 10,
        timeout: 30000,
        ignorableParams: [],
        blockedDomains: [],
    };
}
