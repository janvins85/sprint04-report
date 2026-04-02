// generate.js - Sprint Report Generator
// Spousteno pres GitHub Actions, vyzaduje env: ADO_ORG, ADO_PROJECT, ADO_TEAM, ADO_PAT

const https = require('https');
const fs = require('fs');

const org = process.env.ADO_ORG || 'GradaBookport';
const project = encodeURIComponent(process.env.ADO_PROJECT || 'CentralniSystem');
const team = encodeURIComponent(process.env.ADO_TEAM || 'PowerApps 2026');
const pat = process.env.ADO_PAT;

if (!pat) {
  console.error('ERROR: ADO_PAT secret not set!');
  process.exit(1);
}

const auth = Buffer.from(':' + pat).toString('base64');

function adoGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'dev.azure.com',
      path: path,
      headers: {
        'Authorization': 'Basic ' + auth,
        'Content-Type': 'application/json'
      }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON parse error: ' + data.substring(0,200))); }
      });
    }).on('error', reject);
  });
}

function round2(n) { return Math.round(n * 100) / 100; }

function stateClass(s) {
  if (s === 'Resolved') return 'state-Resolved';
  if (s === 'Closed') return 'state-Closed';
  if (s === 'Active') return 'state-Active';
  return 'state-New';
}

function typeClass(t) {
  if (t === 'Task') return 'type-Task';
  if (t === 'Bug') return 'type-Bug';
  return 'type-Story';
}

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase();
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function personCard(name, data, color) {
  const count = data.items.length;
  const pct = data.totalOriginal > 0 ? Math.min(100, Math.round((data.totalCompleted / data.totalOriginal) * 100)) : 0;
  return [
    '<div class="summary-card" style="border-top-color:' + color + '">',
    '  <div class="person-header">',
    '    <div class="avatar" style="background:' + color + '">' + initials(name) + '</div>',
    '    <div><div class="person-name">' + escHtml(name) + '</div><div class="item-count">' + count + ' polozek</div></div>',
    '  </div>',
    '  <div class="hours-row"><span class="hours-label">Odhad</span><span class="hours-value estimated">' + round2(data.totalOriginal) + ' h</span></div>',
    '  <div class="hours-row"><span class="hours-label">Odpracovano</span><span class="hours-value completed">' + round2(data.totalCompleted) + ' h</span></div>',
    '  <div class="hours-row"><span class="hours-label">Zbyva</span><span class="hours-value ' + (data.totalRemaining > 0 ? 'remaining' : '') + '">' + round2(data.totalRemaining) + ' h</span></div>',
    '  <div class="progress-wrap">',
    '    <div class="progress-label"><span>Plneni</span><span>' + pct + '%</span></div>',
    '    <div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%;background:' + color + '"></div></div>',
    '  </div>',
    '</div>'
  ].join('\n');
}

function detailTable(name, data, color) {
  const withHours = data.items.filter(i => i.originalEstimate > 0 || i.completedWork > 0 || i.remainingWork > 0);
  const rows = withHours.map(i => [
    '<tr>',
    '  <td class="item-id">#' + i.id + '</td>',
    '  <td>' + escHtml(i.title.substring(0, 80)) + (i.title.length > 80 ? '...' : '') + '</td>',
    '  <td><span class="type-badge ' + typeClass(i.type) + '">' + escHtml(i.type) + '</span></td>',
    '  <td><span class="state-badge ' + stateClass(i.state) + '">' + escHtml(i.state) + '</span></td>',
    '  <td class="num">' + (i.originalEstimate || '-') + '</td>',
    '  <td class="num ' + (i.completedWork > 0 ? 'completed' : 'zero') + '">' + (i.completedWork || '-') + '</td>',
    '  <td class="num ' + (i.remainingWork > 0 ? 'remaining' : 'zero') + '">' + (i.remainingWork || '-') + '</td>',
    '</tr>'
  ].join('\n')).join('\n');

  const tableHtml = withHours.length > 0 ? [
    '<table>',
    '<thead><tr>',
    '  <th style="width:60px">ID</th><th>Nazev</th>',
    '  <th style="width:70px">Typ</th><th style="width:90px">Stav</th>',
    '  <th style="width:75px;text-align:right">Odhad</th>',
    '  <th style="width:85px;text-align:right">Splneno</th>',
    '  <th style="width:75px;text-align:right">Zbyva</th>',
    '</tr></thead>',
    '<tbody>' + rows + '</tbody>',
    '<tfoot><tr>',
    '  <td colspan="4" style="padding:12px 16px">CELKEM (' + withHours.length + ' polozek s hodinami z ' + data.items.length + ')</td>',
    '  <td class="num">' + round2(data.totalOriginal) + '</td>',
    '  <td class="num" style="color:#38a169">' + round2(data.totalCompleted) + '</td>',
    '  <td class="num" style="color:#e53e3e">' + (round2(data.totalRemaining) || '-') + '</td>',
    '</tr></tfoot>',
    '</table>'
  ].join('\n') : '';

  return [
    '<div class="person-section">',
    '  <div class="person-section-header">',
    '    <div class="avatar" style="background:' + color + '">' + initials(name) + '</div>',
    '    <h2>' + escHtml(name) + '</h2>',
    '    <span class="stat-pill blue">' + data.items.length + ' polozek</span>',
    '    <span class="stat-pill green">' + round2(data.totalCompleted) + ' h odpracovano</span>',
    (data.totalRemaining > 0 ? '    <span class="stat-pill red">' + round2(data.totalRemaining) + ' h zbyva</span>' : ''),
    '  </div>',
    tableHtml,
    '  <div class="no-hours">' + (data.items.length - withHours.length) + ' polozek nema vyplnene hodiny.</div>',
    '</div>'
  ].join('\n');
}

const CSS = [
  '* { box-sizing: border-box; margin: 0; padding: 0; }',
  'body { font-family: Segoe UI, system-ui, sans-serif; background: #f0f4f8; color: #2d3748; }',
  '.header { background: linear-gradient(135deg, #1a365d 0%, #2b6cb0 100%); color: white; padding: 32px 40px; }',
  '.header h1 { font-size: 26px; font-weight: 700; margin-bottom: 6px; }',
  '.header .subtitle { font-size: 13px; opacity: 0.8; }',
  '.header .sprint-info { display: flex; gap: 16px; margin-top: 14px; flex-wrap: wrap; }',
  '.header .badge { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); border-radius: 20px; padding: 4px 14px; font-size: 12px; }',
  '.container { max-width: 1200px; margin: 0 auto; padding: 28px 20px; }',
  '.summary-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(220px,1fr)); gap: 14px; margin-bottom: 28px; }',
  '.summary-card { background: white; border-radius: 12px; padding: 18px; box-shadow: 0 1px 3px rgba(0,0,0,.1); border-top: 4px solid; }',
  '.person-header { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }',
  '.avatar { width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; color: white; flex-shrink: 0; }',
  '.person-name { font-weight: 600; font-size: 14px; }',
  '.item-count { font-size: 11px; color: #718096; }',
  '.hours-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #f7fafc; }',
  '.hours-label { font-size: 11px; color: #718096; }',
  '.hours-value { font-weight: 600; font-size: 14px; }',
  '.completed { color: #38a169; } .estimated { color: #3182ce; } .remaining { color: #e53e3e; }',
  '.progress-wrap { margin-top: 10px; }',
  '.progress-label { display: flex; justify-content: space-between; font-size: 10px; color: #718096; margin-bottom: 3px; }',
  '.progress-bar { height: 5px; background: #e2e8f0; border-radius: 3px; overflow: hidden; }',
  '.progress-fill { height: 100%; border-radius: 3px; }',
  '.total-bar { background: white; border-radius: 12px; padding: 20px 24px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,.1); display: flex; align-items: center; gap: 28px; flex-wrap: wrap; }',
  '.total-bar h2 { font-size: 14px; font-weight: 600; color: #4a5568; min-width: 130px; }',
  '.total-stat { text-align: center; }',
  '.total-stat .num { font-size: 26px; font-weight: 700; }',
  '.total-stat .lbl { font-size: 11px; color: #718096; margin-top: 2px; }',
  '.divider { width: 1px; height: 44px; background: #e2e8f0; }',
  '.person-section { background: white; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,.1); overflow: hidden; }',
  '.person-section-header { display: flex; align-items: center; gap: 14px; padding: 18px 22px; border-bottom: 1px solid #e2e8f0; flex-wrap: wrap; }',
  '.person-section-header h2 { font-size: 17px; font-weight: 600; flex: 1; }',
  '.stat-pill { border-radius: 20px; padding: 3px 10px; font-size: 12px; font-weight: 600; }',
  '.stat-pill.green { background: #f0fff4; border: 1px solid #9ae6b4; color: #276749; }',
  '.stat-pill.blue { background: #ebf8ff; border: 1px solid #90cdf4; color: #2c5282; }',
  '.stat-pill.red { background: #fff5f5; border: 1px solid #feb2b2; color: #9b2c2c; }',
  'table { width: 100%; border-collapse: collapse; }',
  'th { text-align: left; padding: 9px 14px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: #718096; background: #f7fafc; border-bottom: 1px solid #e2e8f0; }',
  'td { padding: 10px 14px; font-size: 12px; border-bottom: 1px solid #f0f4f8; vertical-align: middle; }',
  'tr:hover td { background: #f7fafc; }',
  '.item-id { color: #718096; font-size: 11px; font-family: monospace; }',
  '.type-badge { display: inline-flex; align-items: center; padding: 1px 7px; border-radius: 4px; font-size: 10px; font-weight: 600; }',
  '.type-Task { background: #ebf8ff; color: #2c5282; } .type-Bug { background: #fff5f5; color: #9b2c2c; } .type-Story { background: #f0fff4; color: #276749; }',
  '.state-badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 10px; font-weight: 600; }',
  '.state-Resolved { background: #c6f6d5; color: #22543d; } .state-Closed { background: #e2e8f0; color: #4a5568; }',
  '.state-Active { background: #bee3f8; color: #2a4365; } .state-New { background: #fefcbf; color: #744210; }',
  'td.num { text-align: right; font-weight: 600; }',
  'td.num.zero { color: #cbd5e0; font-weight: 400; }',
  'tfoot td { font-weight: 700; background: #f7fafc; border-top: 2px solid #e2e8f0; }',
  '.no-hours { padding: 14px 22px; font-size: 12px; color: #718096; font-style: italic; }',
  '.footer { text-align: center; padding: 20px; font-size: 11px; color: #a0aec0; }'
].join('\n');

async function main() {
  console.log('Fetching iterations...');
  const iterationsData = await adoGet('/' + org + '/' + project + '/' + team + '/_apis/work/teamsettings/iterations?api-version=7.1-preview.1');
  const iterations = iterationsData.value || [];

  let targetIteration = iterations.find(it => it.attributes && it.attributes.timeFrame === 'current');
  if (!targetIteration && iterations.length > 0) {
    targetIteration = iterations[iterations.length - 1];
  }
  if (!targetIteration) { console.error('No iteration found'); process.exit(1); }

  console.log('Iteration:', targetIteration.name, targetIteration.id);

  const wiData = await adoGet('/' + org + '/' + project + '/' + team + '/_apis/work/teamsettings/iterations/' + targetIteration.id + '/workitems?api-version=7.1-preview.1');
  const ids = (wiData.workItemRelations || []).map(wi => wi.target.id);
  console.log('Items:', ids.length);

  const fields = 'System.Id,System.Title,System.WorkItemType,System.AssignedTo,Microsoft.VSTS.Scheduling.OriginalEstimate,Microsoft.VSTS.Scheduling.RemainingWork,Microsoft.VSTS.Scheduling.CompletedWork,System.State';
  let allItems = [];
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const batchData = await adoGet('/' + org + '/' + project + '/_apis/wit/workitems?ids=' + batch.join(',') + '&fields=' + encodeURIComponent(fields) + '&api-version=7.1-preview.3');
    allItems = allItems.concat(batchData.value || []);
  }

  const items = allItems.map(item => ({
    id: item.id,
    title: item.fields['System.Title'] || '',
    type: item.fields['System.WorkItemType'] || '',
    assignedTo: (item.fields['System.AssignedTo'] && item.fields['System.AssignedTo'].displayName) || 'Neprirazeno',
    state: item.fields['System.State'] || '',
    originalEstimate: item.fields['Microsoft.VSTS.Scheduling.OriginalEstimate'] || 0,
    remainingWork: item.fields['Microsoft.VSTS.Scheduling.RemainingWork'] || 0,
    completedWork: item.fields['Microsoft.VSTS.Scheduling.CompletedWork'] || 0
  }));

  const people = {};
  items.forEach(item => {
    const name = item.assignedTo;
    if (!people[name]) people[name] = { items: [], totalOriginal: 0, totalCompleted: 0, totalRemaining: 0 };
    people[name].items.push(item);
    people[name].totalOriginal += item.originalEstimate;
    people[name].totalCompleted += item.completedWork;
    people[name].totalRemaining += item.remainingWork;
  });

  const totalOriginal = Object.values(people).reduce((s, p) => s + p.totalOriginal, 0);
  const totalCompleted = Object.values(people).reduce((s, p) => s + p.totalCompleted, 0);
  const totalRemaining = Object.values(people).reduce((s, p) => s + p.totalRemaining, 0);

  const COLORS = ['#4A90D9','#E67E22','#27AE60','#9B59B6','#E74C3C','#1ABC9C','#F39C12','#8E44AD'];
  const personNames = Object.keys(people).filter(p => p !== 'Neprirazeno').sort();
  const today = new Date().toLocaleDateString('cs-CZ', { year: 'numeric', month: 'long', day: 'numeric' });

  const cards = personNames.map((n, i) => personCard(n, people[n], COLORS[i % COLORS.length])).join('\n');
  const tables = personNames.map((n, i) => detailTable(n, people[n], COLORS[i % COLORS.length])).join('\n');

  const html = [
    '<!DOCTYPE html>',
    '<html lang="cs">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<title>Sprint Report | ' + escHtml(targetIteration.name) + '</title>',
    '<style>' + CSS + '</style>',
    '</head>',
    '<body>',
    '<div class="header">',
    '  <h1>Sprint Report - ' + escHtml(targetIteration.name) + '</h1>',
    '  <div class="subtitle">PowerApps 2026 - CentralniSystem - Azure DevOps</div>',
    '  <div class="sprint-info">',
    '    <span class="badge">' + items.length + ' polozek celkem</span>',
    '    <span class="badge">Aktualizovano: ' + today + '</span>',
    '  </div>',
    '</div>',
    '<div class="container">',
    '  <div class="total-bar">',
    '    <h2>Celkovy prehled</h2>',
    '    <div class="total-stat"><div class="num" style="color:#3182ce">' + round2(totalOriginal) + '</div><div class="lbl">Odhadovane h</div></div>',
    '    <div class="divider"></div>',
    '    <div class="total-stat"><div class="num" style="color:#38a169">' + round2(totalCompleted) + '</div><div class="lbl">Odpracovane h</div></div>',
    '    <div class="divider"></div>',
    '    <div class="total-stat"><div class="num" style="color:#e53e3e">' + round2(totalRemaining) + '</div><div class="lbl">Zbyvajici h</div></div>',
    '    <div class="divider"></div>',
    '    <div class="total-stat"><div class="num" style="color:#805ad5">' + personNames.length + '</div><div class="lbl">Lide v tymu</div></div>',
    '  </div>',
    '  <div class="summary-grid">',
    cards,
    '  </div>',
    tables,
    '  <div class="footer">Automaticky vygenerovano GitHub Actions - ' + escHtml(targetIteration.name) + ' - ' + today + '</div>',
    '</div>',
    '</body>',
    '</html>'
  ].join('\n');

  fs.writeFileSync('index.html', html, 'utf8');
  console.log('Done! index.html size:', html.length);
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
