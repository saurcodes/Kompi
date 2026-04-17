import { createServer, IncomingMessage, ServerResponse } from "http";
import { getDeviceSummaries, getRecentRecords, exportAll } from "../tracker/store.js";
import { generateReport } from "../advisor/engine.js";

const PORT = parseInt(process.env.KOMPI_WEB_PORT ?? "7433");

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kompi Dashboard</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#0f1117;color:#e2e8f0;padding:24px}
  h1{color:#60a5fa;font-size:1.5rem;margin-bottom:16px}
  h2{color:#94a3b8;font-size:1rem;margin:16px 0 8px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-bottom:24px}
  .card{background:#1e2130;border:1px solid #2d3148;border-radius:10px;padding:16px}
  .card h3{color:#e2e8f0;font-size:.95rem;margin-bottom:8px}
  .stat{display:flex;justify-content:space-between;margin-bottom:4px;font-size:.85rem}
  .stat span:last-child{color:#60a5fa;font-weight:600}
  .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.75rem;font-weight:600}
  .haiku{background:#14532d;color:#4ade80}
  .sonnet{background:#164e63;color:#67e8f9}
  .opus{background:#4c1d95;color:#c4b5fd}
  .tip{background:#1e2130;border-left:3px solid #f59e0b;padding:12px;margin-bottom:8px;border-radius:4px}
  .tip .title{color:#fbbf24;font-weight:600;margin-bottom:4px}
  .tip .detail{color:#94a3b8;font-size:.85rem}
  .saving{color:#4ade80;font-size:.8rem;margin-left:6px}
  .empty{color:#64748b;font-style:italic}
  table{width:100%;border-collapse:collapse;font-size:.85rem}
  th{text-align:left;color:#64748b;padding:6px 8px;border-bottom:1px solid #2d3148}
  td{padding:6px 8px;border-bottom:1px solid #1e2130}
  .refresh{color:#64748b;font-size:.8rem;margin-bottom:12px}
</style>
</head>
<body>
<h1>Kompi Token Dashboard</h1>
<p class="refresh">Auto-refreshes every 30s &nbsp;|&nbsp; <a href="/" style="color:#60a5fa">Refresh now</a></p>
<div id="root">Loading...</div>
<script>
async function load() {
  const [summaries, report] = await Promise.all([
    fetch('/api/summaries').then(r=>r.json()),
    fetch('/api/report').then(r=>r.json()),
  ]);

  const modelBadge = m => {
    if(m.includes('opus')) return '<span class="badge opus">Opus</span>';
    if(m.includes('sonnet')) return '<span class="badge sonnet">Sonnet</span>';
    return '<span class="badge haiku">Haiku</span>';
  };

  const cards = summaries.map(d => \`
    <div class="card">
      <h3>\${d.device_label}</h3>
      <div class="stat"><span>Sessions</span><span>\${d.total_sessions}</span></div>
      <div class="stat"><span>Input tokens</span><span>\${d.total_input_tokens.toLocaleString()}</span></div>
      <div class="stat"><span>Output tokens</span><span>\${d.total_output_tokens.toLocaleString()}</span></div>
      <div class="stat"><span>Cache read</span><span>\${d.total_cache_read_tokens.toLocaleString()}</span></div>
      <div class="stat"><span>Total cost</span><span>$\${d.total_cost_usd.toFixed(4)}</span></div>
      <div class="stat"><span>Avg tokens/session</span><span>\${Math.round(d.avg_tokens_per_session).toLocaleString()}</span></div>
      <div class="stat"><span>Top model</span><span>\${modelBadge(d.top_model ?? 'unknown')}</span></div>
      <div class="stat"><span>Last seen</span><span style="color:#94a3b8;font-size:.8rem">\${new Date(d.last_seen).toLocaleString()}</span></div>
    </div>
  \`).join('');

  const allTips = report.flatMap(r => r.tips.map(t => ({...t, device: r.device_label})));
  const tipsHtml = allTips.length === 0
    ? '<p class="empty">No recommendations — usage looks efficient!</p>'
    : allTips.map(t => \`
        <div class="tip">
          <div class="title">\${t.title}\${t.estimatedSavingsPct ? \`<span class="saving">(~\${t.estimatedSavingsPct}% savings)</span>\` : ''} <span style="color:#64748b;font-size:.8rem">on \${t.device}</span></div>
          <div class="detail">\${t.detail}</div>
        </div>
      \`).join('');

  document.getElementById('root').innerHTML = \`
    <h2>Devices</h2>
    <div class="grid">\${cards || '<p class="empty">No data yet. Run some Claude Code sessions.</p>'}</div>
    <h2>Advisor Recommendations</h2>
    \${tipsHtml}
  \`;
}
load();
setInterval(load, 30000);
</script>
</body>
</html>`;

function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}

function html(res: ServerResponse, content: string) {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(content);
}

export function startWebDashboard() {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/";

    if (url === "/" || url === "/index.html") return html(res, HTML);

    if (url === "/api/summaries") {
      const summaries = getDeviceSummaries();
      return json(res, summaries);
    }

    if (url === "/api/report") {
      const summaries = getDeviceSummaries();
      const reports = summaries.map((d) => ({
        device_id: d.device_id,
        device_label: d.device_label,
        ...generateReport(d.device_id),
      }));
      return json(res, reports);
    }

    if (url === "/api/export") {
      const records = exportAll();
      return json(res, records);
    }

    res.writeHead(404);
    res.end("Not found");
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Kompi: port ${PORT} is already in use. Set KOMPI_WEB_PORT to use a different port.`);
    } else {
      console.error(`Kompi web server error: ${err.message}`);
    }
    process.exit(1);
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Kompi web dashboard: http://localhost:${PORT}`);
  });

  process.on("SIGINT", () => server.close());
  process.on("SIGTERM", () => server.close());
}
