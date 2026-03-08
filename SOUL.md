This is a commandline tool using nodejs that scrapes a website from a starting URL

## Phase 1 — Core / Must-Haves

- Create a new project file for each unique domain. Ask user some common questions via CLI and persist those settings for future.
- Support multiple start URLs (space + comma seperated). For each start URL, create a separate folder under the project folder for storing the results. Do not scan pages in parent folders of the start URLs.
- When a new scan is started, and the domain is know, preload the information from the saved project file. If the user changes any info, update the project file for future.
- Parse the start URLs to get the domain name and the path. The domain name is used to create the project file. The path is used to create the results folder for the results.
- Make a note of all the unique pages, their HTTP response code, the mime type, the load speed, the title, the meta description, the meta keywords, the h1, h2, h3, h4, h5, h6 tags, the alt tags of the images, the rel tags of the links, the rel=canonical tags, the rel=alternate tags, the rel=stylesheet tags, the rel=script tags.
- Allow defining ignorable query parameters, so a link with `?session=123` is treated as the same page as `?session=456`. The ignorable parameters should be stored in the project file.
- If a page being scanned links (either absolute or relative) to the same domain being scanned, as long as it's within the currently scanned path, and if it's not already been scanned in the current session already, add it to the list of pages to scan, as well as the results page. But if the link is external, add it to the results page. Also, as long as it's not a blocked domain, check the HTTP response code, the mime type, and add it to the results page.
- Concurrent crawling with configurable parallelism — crawl multiple pages simultaneously with a tunable concurrency limit to avoid painfully slow scans on large sites.
- Rate limiting / politeness delay — configurable delay between requests to avoid hammering servers.
- Retry logic with exponential backoff — handle transient network failures gracefully. This should accomodate if the user kills the script, and asks to resume latest unfinished scan.
- Configurable crawl depth limit — max depth from the start URL to prevent runaway scans.
- Robots.txt parsing — Scan, but marks any links/file results found that are disallowed by robots.txt.
- Real-time CLI progress — show a live crawl dashboard with progress bar, pages discovered, pages scanned, errors encountered, and current URL.
- Broken link detection — flag all 4xx/5xx responses alongside the source page(s) that link to them.

## Phase 2 — Useful Enhancements
- The results should be saved in a structured way, so that they can be used for future reference. This includes the project file. All output files should live in this project's root folder.
- The result should include a HTML output to view and filter and investigate the results visually.
- Redirect chain tracking — map out redirect hops (301/302), flag redirect loops and chains exceeding a configurable length.
- Missing / duplicate title & meta description report — flag pages with missing, too-short, too-long, or duplicated meta tags.
- Heading hierarchy validation — flag pages with multiple `<h1>` tags or skipped heading levels (e.g. `<h1>` → `<h3>`).
- Mixed content detection — flag HTTP sub-resources loaded on HTTPS pages.
- Missing security headers check — verify presence of `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, etc.
- Resource size tracking — record page weight, individual image/CSS/JS sizes, and flag oversized assets.
- Sitemap.xml parsing — compare sitemap entries against discovered pages to identify orphan pages (in sitemap but not linked) and unindexed pages (linked but not in sitemap).
- CSV / JSON export — machine-readable output for further processing or integration with other tools.
- Resume interrupted scans — persist crawl state to disk so a scan can be resumed after interruption.
- Cookie / basic auth support — provide session cookies or basic auth credentials to scan protected/authenticated pages.

## Phase 3 — Advanced Features

### Phase 3.1 — Interactive HTML Report
Generate a standalone, interactive HTML report with filterable tables, charts (page speed distribution, response code breakdown, link graph), and drill-down views per page. This replaces raw CLI output with a polished, shareable deliverable.

### Phase 3.2 — Scan Diffing & Change Monitoring
Compare the current scan with a previous scan to produce a diff report: new pages, removed pages, changed titles/descriptions, newly broken links, and status code changes. Enables the tool to be used for recurring monitoring rather than one-off audits.

### Phase 3.3 — JavaScript Rendering Mode
Integrate Puppeteer or Playwright to optionally render pages with full JS execution, enabling accurate auditing of SPAs and client-side-rendered content that static HTTP fetching would miss.

### Phase 3.4 — Accessibility Audit (WCAG)
Run automated WCAG 2.1 checks per page — missing alt text, insufficient color contrast, missing ARIA labels, form label associations, keyboard navigability issues. Output a per-page accessibility score alongside specific violations.

### Phase 3.5 — Internal Link Graph & Authority Analysis
Build a directed graph of all internal links and compute metrics like internal PageRank, orphan pages (zero inbound links), and hub/authority scores. Visualise the link structure in the HTML report (Phase 3.1) as an interactive force-directed graph.

### Phase 3.6 — Structured Data & Schema.org Validation
Parse and validate JSON-LD, Microdata, and RDFa markup on each page. Check for schema.org compliance, flag missing required properties, and test against Google's Rich Results eligibility criteria.

### Phase 3.7 — Security & Sensitive File Scanner
Probe for commonly exposed sensitive files (`.env`, `.git/`, `wp-config.php`, `phpinfo.php`, backup archives) and check for open redirect vulnerabilities by testing known redirect parameter patterns.

### Phase 3.8 — Core Web Vitals Estimation
Using the headless browser from Phase 3.3, measure Largest Contentful Paint (LCP), Cumulative Layout Shift (CLS), and Interaction to Next Paint (INP) for each page. Aggregate results into a performance dashboard within the HTML report.
