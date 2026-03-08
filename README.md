# 🔍 webaudit

A fast, opinionated CLI website auditor built with Node.js. Crawl any site, extract SEO metadata, detect broken links, check security headers, and generate a beautiful HTML report — all from a single command.

![HTML Report](https://raw.githubusercontent.com/ssjohl/webaudit/master/screenshot.png)

## Features

- **Concurrent crawling** with configurable parallelism and rate limiting
- **Broken link detection** — flags 4xx/5xx responses with source pages
- **SEO analysis** — missing/duplicate titles, meta descriptions, heading hierarchy, alt text
- **Redirect chain tracking** — full chain capture with loop detection
- **Security headers** — checks CSP, HSTS, X-Frame-Options, and more
- **Mixed content detection** — HTTP resources on HTTPS pages
- **Sitemap comparison** — orphan + unindexed page discovery
- **HTML report** — interactive, dark-themed, self-contained dashboard
- **CSV + JSON export** — machine-readable output for further processing
- **Robots.txt aware** — flags disallowed URLs without skipping them
- **Resume support** — Ctrl+C saves state, re-run to pick up where you left off
- **Per-domain config** — settings persist and reload automatically
- **Cookie & basic auth** — crawl protected/authenticated pages

## Requirements

- Node.js **18+**

## Installation

```bash
git clone https://github.com/YOUR_USERNAME/webaudit.git
cd webaudit
npm install
```

Or install globally:

```bash
npm install -g .
```

## Usage

```bash
# Basic — crawl a whole site
node bin/webaudit.js https://example.com

# Multiple paths on the same domain
node bin/webaudit.js https://example.com/blog https://example.com/docs

# Comma-separated
node bin/webaudit.js https://example.com/blog,https://example.com/docs
```

On first run, you'll be prompted for settings:

```
? Concurrent requests: 5
? Delay between requests (ms): 200
? Maximum crawl depth: 10
? Maximum redirect hops: 10
? Request timeout (ms): 30000
? Ignorable query parameters (comma-separated):
? Blocked external domains (comma-separated):
? Cookies (key=value; key2=value2):
? Basic auth (user:password, leave empty for none):
```

These settings are saved per domain and reloaded on subsequent runs.

## Output

All results are saved to `./output/<domain>/scans/<timestamp>/results/`:

```
results/
├── report.html             ← Open this in your browser
├── pages.json              # Full page data with metadata
├── pages.csv               # Spreadsheet-friendly export
├── broken-links.json       # Broken URLs + source pages
├── redirect-chains.json    # Redirect hops + loop detection
├── seo-issues.json         # SEO analysis results
├── security-report.json    # Missing security headers
├── sitemap-comparison.json # Orphan + unindexed pages
└── summary.json            # Aggregate stats
```

### HTML Report

The report is a self-contained HTML file (no external dependencies) with:

- **Dashboard cards** — total pages, broken links, avg load time, redirects, SEO issues
- **All Pages** — sortable, filterable table with URL search, type/status filters
- **Broken Links** — broken URLs with status codes and linking pages
- **SEO Issues** — per-page errors/warnings with duplicate detection
- **Security** — missing headers per page
- **Redirects** — full chains with loop flags
- **Sitemap** — orphan and unindexed page lists (when sitemap.xml exists)

## Resuming Scans

Press **Ctrl+C** during a scan to save progress. Re-run the same command and you'll be prompted:

```
? Found an unfinished scan (2026-03-08T...). Resume it? (Y/n)
```

## How It Works

```
bin/webaudit.js          CLI entry point
src/
├── cli.js               Orchestrator — prompts, lifecycle, SIGINT handling
├── config.js            Per-domain JSON config (./output/<domain>/config.json)
├── state.js             Scan state persistence + resume
├── crawler.js           Concurrent crawl engine (async semaphore + rate limiter)
├── fetcher.js           HTTP fetch with retries, redirect chain capture, auth
├── parser.js            Cheerio HTML parser — SEO metadata + mixed content
├── robots.js            robots.txt fetch & parse
├── url-utils.js         URL normalisation, scope checking, param stripping
├── seo-analyzer.js      Post-crawl SEO analysis
├── security-checker.js  Security header validation
├── sitemap.js           Sitemap.xml fetch, parse, and comparison
├── dashboard.js         Real-time CLI progress bar
├── results.js           JSON/CSV writer + terminal summary
└── report.js            Self-contained HTML report generator
```

## Configuration

Settings are stored in `./output/<domain>/config.json` and reloaded automatically:

| Setting | Default | Description |
|---|---|---|
| `concurrency` | `5` | Parallel requests |
| `rateLimit` | `200` | Delay between requests (ms) |
| `maxDepth` | `10` | Max crawl depth from start URL |
| `maxRedirects` | `10` | Max redirect hops before flagging |
| `timeout` | `30000` | Request timeout (ms) |
| `ignorableParams` | `[]` | Query params to strip (e.g. `session`, `utm_source`) |
| `blockedDomains` | `[]` | External domains to skip entirely |
| `cookies` | `""` | Session cookies for authenticated crawling |
| `basicAuth` | `""` | Basic auth credentials (`user:password`) |

## Roadmap

See [SOUL.md](SOUL.md) for the full feature roadmap, including:

- **Phase 3.1** — Enhanced interactive HTML report with charts
- **Phase 3.2** — Scan diffing & change monitoring
- **Phase 3.3** — JavaScript rendering (Puppeteer/Playwright)
- **Phase 3.4** — WCAG accessibility audit
- **Phase 3.5** — Internal link graph & authority analysis
- **Phase 3.6** — Schema.org validation
- **Phase 3.7** — Security & sensitive file scanner
- **Phase 3.8** — Core Web Vitals estimation

## License

MIT
