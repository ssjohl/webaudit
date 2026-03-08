/**
 * Real-time CLI progress dashboard.
 */

import logUpdate from 'log-update';

export class Dashboard {
    constructor() {
        this.domain = '';
        this.startPath = '';
        this.totalDiscovered = 0;
        this.totalScanned = 0;
        this.internalLinks = 0;
        this.externalLinks = 0;
        this.brokenLinks = 0;
        this.errors = 0;
        this.currentUrl = '';
        this.startTime = Date.now();
        this.active = false;
    }

    start(domain, startPath) {
        this.domain = domain;
        this.startPath = startPath;
        this.startTime = Date.now();
        this.active = true;
        this.render();
    }

    update({ totalDiscovered, totalScanned, internalLinks, externalLinks, brokenLinks, errors, currentUrl } = {}) {
        if (totalDiscovered !== undefined) this.totalDiscovered = totalDiscovered;
        if (totalScanned !== undefined) this.totalScanned = totalScanned;
        if (internalLinks !== undefined) this.internalLinks = internalLinks;
        if (externalLinks !== undefined) this.externalLinks = externalLinks;
        if (brokenLinks !== undefined) this.brokenLinks = brokenLinks;
        if (errors !== undefined) this.errors = errors;
        if (currentUrl !== undefined) this.currentUrl = currentUrl;
        this.render();
    }

    render() {
        if (!this.active) return;

        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
        const pct = this.totalDiscovered > 0
            ? Math.round((this.totalScanned / this.totalDiscovered) * 100)
            : 0;

        const barWidth = 30;
        const filled = Math.round((pct / 100) * barWidth);
        const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);

        const shortUrl = this.currentUrl.length > 60
            ? '...' + this.currentUrl.slice(-57)
            : this.currentUrl;

        const lines = [
            '',
            ` 🔍 webaudit — ${this.domain}${this.startPath}`,
            ` ${bar}  ${pct}% │ ${this.totalScanned}/${this.totalDiscovered} pages`,
            ` ⏱  ${elapsed}s elapsed`,
            ` 🔗  ${this.internalLinks} internal │ ${this.externalLinks} external │ ${this.brokenLinks} broken │ ${this.errors} errors`,
            ` ⚡  ${shortUrl || 'starting...'}`,
            '',
        ];

        logUpdate(lines.join('\n'));
    }

    stop() {
        this.active = false;
        logUpdate.done();
    }
}
