/**
 * Self-contained HTML report generator.
 * Produces a single report.html file with inline CSS/JS.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Generate a self-contained HTML report.
 * @param {string} outputDir - Directory to write report.html
 * @param {Object} data - { pages, seoAnalysis, sitemapComparison, domain, scanId }
 */
export async function generateReport(outputDir, data) {
    const html = buildReportHtml(data);
    const reportPath = join(outputDir, 'report.html');
    await writeFile(reportPath, html, 'utf-8');
    return reportPath;
}

function buildReportHtml({ pages, seoAnalysis, sitemapComparison, domain, scanId }) {
    const pagesArr = Object.values(pages);
    const internal = pagesArr.filter((p) => p.type === 'internal');
    const external = pagesArr.filter((p) => p.type === 'external');
    const broken = pagesArr.filter((p) => p.status >= 400 || p.status === 0);
    const htmlPages = internal.filter((p) => p.mimeType?.includes('html'));
    const redirects = pagesArr.filter((p) => p.redirectChain?.length > 0);
    const avgLoad = htmlPages.length > 0
        ? Math.round(htmlPages.reduce((s, p) => s + (p.loadTimeMs || 0), 0) / htmlPages.length)
        : 0;

    // Sanitise data for embedding
    const jsonData = JSON.stringify({
        pages: pagesArr,
        seoAnalysis,
        sitemapComparison,
    }).replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>webaudit Report — ${esc(domain)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0f172a;--surface:#1e293b;--surface2:#334155;--border:#475569;--text:#e2e8f0;--text2:#94a3b8;--accent:#38bdf8;--green:#4ade80;--red:#f87171;--yellow:#fbbf24;--orange:#fb923c}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;padding:2rem}
h1{font-size:1.8rem;margin-bottom:.5rem}
h2{font-size:1.3rem;margin:2rem 0 1rem;color:var(--accent);border-bottom:1px solid var(--surface2);padding-bottom:.5rem}
.subtitle{color:var(--text2);font-size:.9rem;margin-bottom:2rem}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin-bottom:2rem}
.card{background:var(--surface);border-radius:12px;padding:1.2rem;border:1px solid var(--surface2)}
.card .value{font-size:2rem;font-weight:700;color:var(--accent)}
.card .label{font-size:.8rem;color:var(--text2);margin-top:.25rem}
.card.warn .value{color:var(--yellow)}
.card.error .value{color:var(--red)}
.card.ok .value{color:var(--green)}
.tabs{display:flex;gap:.5rem;margin-bottom:1rem;flex-wrap:wrap}
.tab{background:var(--surface);border:1px solid var(--surface2);border-radius:8px;padding:.5rem 1rem;cursor:pointer;color:var(--text2);font-size:.85rem;transition:all .2s}
.tab:hover,.tab.active{background:var(--accent);color:var(--bg);border-color:var(--accent)}
.panel{display:none}
.panel.active{display:block}
.filter-bar{display:flex;gap:.5rem;margin-bottom:1rem;flex-wrap:wrap;align-items:center}
.filter-bar input,.filter-bar select{background:var(--surface);border:1px solid var(--surface2);border-radius:6px;padding:.4rem .8rem;color:var(--text);font-size:.85rem}
.filter-bar input{min-width:250px}
table{width:100%;border-collapse:collapse;font-size:.85rem}
th{background:var(--surface2);text-align:left;padding:.6rem .8rem;cursor:pointer;user-select:none;white-space:nowrap;position:sticky;top:0}
th:hover{background:var(--border)}
td{padding:.5rem .8rem;border-bottom:1px solid var(--surface2);max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
tr:hover td{background:var(--surface)}
.status-2{color:var(--green)}.status-3{color:var(--yellow)}.status-4,.status-0{color:var(--red)}.status-5{color:var(--orange)}
.badge{display:inline-block;padding:.15rem .5rem;border-radius:4px;font-size:.75rem;font-weight:600}
.badge-error{background:var(--red);color:#000}
.badge-warn{background:var(--yellow);color:#000}
.badge-ok{background:var(--green);color:#000}
.badge-info{background:var(--accent);color:#000}
.issue-list{list-style:none;padding:0}
.issue-list li{background:var(--surface);border:1px solid var(--surface2);border-radius:8px;padding:.8rem 1rem;margin-bottom:.5rem}
.issue-list .url{color:var(--accent);font-size:.85rem;word-break:break-all}
.issue-list .issue-item{color:var(--text2);font-size:.82rem;margin-top:.3rem}
.empty{color:var(--text2);font-style:italic;padding:2rem;text-align:center}
.table-wrap{overflow-x:auto;max-height:70vh;overflow-y:auto;border:1px solid var(--surface2);border-radius:8px}
@media(max-width:768px){body{padding:1rem}.cards{grid-template-columns:1fr 1fr}}
</style>
</head>
<body>
<h1>🔍 webaudit — ${esc(domain)}</h1>
<p class="subtitle">Scan: ${esc(scanId)} &bull; ${new Date().toLocaleString()}</p>

<div class="cards">
  <div class="card"><div class="value">${pagesArr.length}</div><div class="label">Total Pages</div></div>
  <div class="card"><div class="value">${internal.length}</div><div class="label">Internal</div></div>
  <div class="card"><div class="value">${external.length}</div><div class="label">External</div></div>
  <div class="card ${broken.length > 0 ? 'error' : 'ok'}"><div class="value">${broken.length}</div><div class="label">Broken Links</div></div>
  <div class="card"><div class="value">${avgLoad}ms</div><div class="label">Avg Load Time</div></div>
  <div class="card ${redirects.length > 0 ? 'warn' : 'ok'}"><div class="value">${redirects.length}</div><div class="label">Redirects</div></div>
  <div class="card ${seoAnalysis?.summary?.errors > 0 ? 'error' : 'ok'}"><div class="value">${seoAnalysis?.summary?.totalIssues || 0}</div><div class="label">SEO Issues</div></div>
</div>

<div class="tabs">
  <div class="tab active" data-tab="pages">📄 All Pages</div>
  <div class="tab" data-tab="broken">❌ Broken Links</div>
  <div class="tab" data-tab="seo">🔍 SEO Issues</div>
  <div class="tab" data-tab="security">🔒 Security</div>
  <div class="tab" data-tab="redirects">🔀 Redirects</div>
  ${sitemapComparison ? '<div class="tab" data-tab="sitemap">🗺️ Sitemap</div>' : ''}
</div>

<div id="pages" class="panel active">
  <div class="filter-bar">
    <input type="text" id="pageSearch" placeholder="Filter by URL..." oninput="filterPages()">
    <select id="typeFilter" onchange="filterPages()"><option value="">All types</option><option value="internal">Internal</option><option value="external">External</option></select>
    <select id="statusFilter" onchange="filterPages()"><option value="">All statuses</option><option value="ok">2xx OK</option><option value="redirect">3xx Redirect</option><option value="broken">4xx/5xx/Error</option></select>
  </div>
  <div class="table-wrap">
    <table id="pagesTable">
      <thead><tr>
        <th onclick="sortTable('pagesTable',0)">URL</th>
        <th onclick="sortTable('pagesTable',1)">Status</th>
        <th onclick="sortTable('pagesTable',2)">Type</th>
        <th onclick="sortTable('pagesTable',3)">MIME</th>
        <th onclick="sortTable('pagesTable',4)">Load (ms)</th>
        <th onclick="sortTable('pagesTable',5)">Size</th>
        <th onclick="sortTable('pagesTable',6)">Title</th>
      </tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="broken" class="panel">
  <div class="table-wrap">
    <table id="brokenTable">
      <thead><tr>
        <th>URL</th><th>Status</th><th>Error</th><th>Linked From</th>
      </tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<div id="seo" class="panel">
  <div id="seoContent"></div>
</div>

<div id="security" class="panel">
  <div id="securityContent"></div>
</div>

<div id="redirects" class="panel">
  <div class="table-wrap">
    <table id="redirectsTable">
      <thead><tr>
        <th>URL</th><th>Final URL</th><th>Hops</th><th>Loop?</th><th>Chain</th>
      </tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>

${sitemapComparison ? '<div id="sitemap" class="panel"><div id="sitemapContent"></div></div>' : ''}

<script>
const DATA = ${jsonData};

// Tabs
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById(t.dataset.tab).classList.add('active');
  });
});

// Render pages table
function renderPages(pages) {
  const tbody = document.querySelector('#pagesTable tbody');
  tbody.innerHTML = pages.map(p => {
    const sc = p.status ? 'status-' + String(p.status)[0] : 'status-0';
    return '<tr>'
      + '<td title="'+esc(p.url)+'">'+esc(truncate(p.url,80))+'</td>'
      + '<td class="'+sc+'">'+(p.status||'ERR')+'</td>'
      + '<td>'+esc(p.type||'')+'</td>'
      + '<td>'+esc(p.mimeType||'')+'</td>'
      + '<td>'+(p.loadTimeMs||'')+'</td>'
      + '<td>'+formatBytes(p.contentLength)+'</td>'
      + '<td>'+esc(p.metadata?.title||'')+'</td>'
      + '</tr>';
  }).join('');
}

function filterPages() {
  const q = document.getElementById('pageSearch').value.toLowerCase();
  const type = document.getElementById('typeFilter').value;
  const status = document.getElementById('statusFilter').value;
  let filtered = DATA.pages;
  if (q) filtered = filtered.filter(p => p.url.toLowerCase().includes(q));
  if (type) filtered = filtered.filter(p => p.type === type);
  if (status === 'ok') filtered = filtered.filter(p => p.status >= 200 && p.status < 300);
  else if (status === 'redirect') filtered = filtered.filter(p => p.status >= 300 && p.status < 400);
  else if (status === 'broken') filtered = filtered.filter(p => p.status >= 400 || p.status === 0);
  renderPages(filtered);
}

// Broken
function renderBroken() {
  const broken = DATA.pages.filter(p => p.status >= 400 || p.status === 0);
  const tbody = document.querySelector('#brokenTable tbody');
  if (!broken.length) { tbody.innerHTML = '<tr><td colspan="4" class="empty">No broken links found 🎉</td></tr>'; return; }
  tbody.innerHTML = broken.map(p => '<tr>'
    + '<td title="'+esc(p.url)+'">'+esc(truncate(p.url,60))+'</td>'
    + '<td class="status-'+(p.status?String(p.status)[0]:'0')+'">'+(p.status||'ERR')+'</td>'
    + '<td>'+esc(p.error||'')+'</td>'
    + '<td>'+esc((p.linkedFrom||[]).slice(0,3).join(', '))+'</td>'
    + '</tr>').join('');
}

// SEO
function renderSEO() {
  const el = document.getElementById('seoContent');
  const seo = DATA.seoAnalysis;
  if (!seo || !seo.issues.length) { el.innerHTML = '<p class="empty">No SEO issues found 🎉</p>'; return; }
  let html = '<p style="margin-bottom:1rem"><span class="badge badge-error">'+seo.summary.errors+' errors</span> <span class="badge badge-warn">'+seo.summary.warnings+' warnings</span></p>';
  html += '<ul class="issue-list">';
  for (const page of seo.issues) {
    html += '<li><div class="url">'+esc(page.url)+'</div>';
    for (const issue of page.issues) {
      const cls = issue.severity === 'error' ? 'badge-error' : 'badge-warn';
      html += '<div class="issue-item"><span class="badge '+cls+'">'+issue.severity+'</span> '+esc(issue.message)+'</div>';
    }
    html += '</li>';
  }
  html += '</ul>';
  if (seo.duplicateIssues?.length) {
    html += '<h2>Duplicate Content</h2><ul class="issue-list">';
    for (const d of seo.duplicateIssues) {
      html += '<li><div class="issue-item"><span class="badge badge-warn">warning</span> '+esc(d.message)+'</div>';
      html += '<div class="url">'+d.urls.map(u => esc(u)).join('<br>')+'</div></li>';
    }
    html += '</ul>';
  }
  el.innerHTML = html;
}

// Security
function renderSecurity() {
  const el = document.getElementById('securityContent');
  const pages = DATA.pages.filter(p => p.security?.missing?.length > 0);
  if (!pages.length) { el.innerHTML = '<p class="empty">All pages have complete security headers 🎉</p>'; return; }
  let html = '<ul class="issue-list">';
  for (const p of pages) {
    html += '<li><div class="url">'+esc(p.url)+'</div>';
    html += '<div class="issue-item">Missing: '+p.security.missing.map(h => '<span class="badge badge-warn">'+h+'</span>').join(' ')+'</div></li>';
  }
  html += '</ul>';
  el.innerHTML = html;
}

// Redirects
function renderRedirects() {
  const rds = DATA.pages.filter(p => p.redirectChain?.length > 0);
  const tbody = document.querySelector('#redirectsTable tbody');
  if (!rds.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty">No redirects found</td></tr>'; return; }
  tbody.innerHTML = rds.map(p => '<tr>'
    + '<td>'+esc(truncate(p.url,50))+'</td>'
    + '<td>'+esc(truncate(p.finalUrl||'',50))+'</td>'
    + '<td>'+p.redirectChain.length+'</td>'
    + '<td>'+(p.redirectLoop?'<span class="badge badge-error">LOOP</span>':'')+'</td>'
    + '<td>'+p.redirectChain.map(r => r.status+'→').join(' ')+'</td>'
    + '</tr>').join('');
}

// Sitemap
function renderSitemap() {
  const el = document.getElementById('sitemapContent');
  if (!el) return;
  const sm = DATA.sitemapComparison;
  if (!sm) { el.innerHTML = '<p class="empty">No sitemap data</p>'; return; }
  let html = '<div class="cards" style="margin-bottom:1rem">'
    + '<div class="card '+(sm.orphanPages.length?'warn':'ok')+'"><div class="value">'+sm.orphanPages.length+'</div><div class="label">Orphan Pages</div></div>'
    + '<div class="card '+(sm.unindexedPages.length?'warn':'ok')+'"><div class="value">'+sm.unindexedPages.length+'</div><div class="label">Unindexed Pages</div></div>'
    + '</div>';
  if (sm.orphanPages.length) {
    html += '<h2>Orphan Pages (in sitemap, not linked)</h2><ul class="issue-list">';
    for (const u of sm.orphanPages.slice(0,50)) html += '<li><div class="url">'+esc(u)+'</div></li>';
    if (sm.orphanPages.length > 50) html += '<li class="empty">...and '+(sm.orphanPages.length-50)+' more</li>';
    html += '</ul>';
  }
  if (sm.unindexedPages.length) {
    html += '<h2>Unindexed Pages (linked, not in sitemap)</h2><ul class="issue-list">';
    for (const u of sm.unindexedPages.slice(0,50)) html += '<li><div class="url">'+esc(u)+'</div></li>';
    if (sm.unindexedPages.length > 50) html += '<li class="empty">...and '+(sm.unindexedPages.length-50)+' more</li>';
    html += '</ul>';
  }
  el.innerHTML = html;
}

// Sorting
let sortState = {};
function sortTable(tableId, col) {
  const key = tableId + col;
  sortState[key] = !sortState[key];
  const tbody = document.querySelector('#'+tableId+' tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  rows.sort((a, b) => {
    const aVal = a.children[col]?.textContent || '';
    const bVal = b.children[col]?.textContent || '';
    const aNum = parseFloat(aVal), bNum = parseFloat(bVal);
    if (!isNaN(aNum) && !isNaN(bNum)) return sortState[key] ? aNum - bNum : bNum - aNum;
    return sortState[key] ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
  });
  rows.forEach(r => tbody.appendChild(r));
}

function esc(s) { if (!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function truncate(s, n) { return s && s.length > n ? s.slice(0, n) + '...' : s || ''; }
function formatBytes(b) { if (!b) return ''; if (b < 1024) return b+'B'; if (b < 1048576) return (b/1024).toFixed(1)+'KB'; return (b/1048576).toFixed(1)+'MB'; }

// Init
renderPages(DATA.pages);
renderBroken();
renderSEO();
renderSecurity();
renderRedirects();
renderSitemap();
</script>
</body>
</html>`;
}

function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
