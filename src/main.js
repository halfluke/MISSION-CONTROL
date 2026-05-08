/**
 * Squid-Map -- main entry point.
 *
 * Starts with mock data, then watches the GSD snapshot file for live updates.
 * When a snapshot arrives, transitions to live data seamlessly.
 */

import { Scene } from './render/Scene.js';
import { MOCK_DATA } from './render/mock-data.js';
import { watchSnapshotFile } from './data/file-watcher.js';
import { toggleLayoutMode, LAYOUT_MODE } from './render/layout.js';

// Hex to RGBA helper for inline panel styles
function _hexToRgba(hex, alpha) {
  if (!hex || typeof hex !== 'string') return `rgba(107,114,128,${alpha || 1})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(107,114,128,${alpha || 1})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

const canvas = document.getElementById('canvas');
const panel = document.getElementById('detail-panel');

const STATUS_COLORS = {
  active: '#4ade80', idle: '#60a5fa', error: '#f87171',
  waiting: '#9ca3af', completing: '#fbbf24', pending: '#6b7280',
};

// Connecting overlay
const overlay = document.createElement('div');
overlay.id = 'connecting-overlay';
overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0f172a;z-index:100;transition:opacity 0.6s;font-family:system-ui,sans-serif;color:#94a3b8;';

const spinner = document.createElement('div');
spinner.style.cssText = 'width:24px;height:24px;border:2px solid #334155;border-top-color:#60a5fa;border-radius:50%;animation:squid-spin 1s linear infinite;margin:0 auto 16px;';
const st = document.createElement('style');
st.textContent = '@keyframes squid-spin{to{transform:rotate(360deg)}}';
document.head.appendChild(st);

const label = document.createElement('div');
label.textContent = 'Connecting to GSD...';
label.style.cssText = 'font-size:14px;opacity:0.6;';
overlay.appendChild(spinner);
overlay.appendChild(label);
document.body.appendChild(overlay);

// Scene init
const scene = new Scene(canvas, MOCK_DATA);
let isLiveData = false;
let watcher = null;
let errorTimeout = null;

// Error overlay for corrupt snapshot data
const errorOverlay = document.createElement('div');
errorOverlay.id = 'error-overlay';
errorOverlay.style.cssText = 'position:fixed;top:16px;right:16px;background:rgba(248,113,113,0.15);border:1px solid rgba(248,113,113,0.4);border-radius:10px;padding:12px 18px;font-family:system-ui,sans-serif;color:#f87171;font-size:13px;z-index:200;display:none;max-width:320px;backdrop-filter:blur(8px);';
document.body.appendChild(errorOverlay);

function showErrorOverlay(message) {
  errorOverlay.textContent = message;
  errorOverlay.style.display = 'block';
  if (errorTimeout) clearTimeout(errorTimeout);
  errorTimeout = setTimeout(() => {
    errorOverlay.style.display = 'none';
  }, 8000);
}

function onSnapshotUpdate(sceneData) {
  if (!isLiveData) {
    isLiveData = true;
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 600);
    console.log('[Squid-Map] Switched to live data');
  }
  scene.update(sceneData);
  // Clear error overlay on successful parse
  errorOverlay.style.display = 'none';
  if (errorTimeout) clearTimeout(errorTimeout);
}

watcher = watchSnapshotFile(
  new URL('/.gsd/squid-state/snapshot.json', location.origin).pathname,
  onSnapshotUpdate,
  {
    onMissing: () => {},
    onError: showErrorOverlay,
  }
);

// Canvas sizing
function resize() {
  const container = canvas.parentElement;
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
}
resize();
window.addEventListener('resize', resize);

// Detail panel — type-specific rendering
function showDetail(nodeData) {
  if (!nodeData || typeof nodeData !== 'object') return;

  const color = STATUS_COLORS[nodeData.status] || '#6b7280';
  const type = nodeData.type || 'unknown';

  let actionsHtml = '';
  if (Array.isArray(nodeData.actions) && nodeData.actions.length) {
    actionsHtml = nodeData.actions.map(a => {
      const statusClass = a.status === 'success' ? 'success' : a.status === 'failed' ? 'failed' : 'running';
      return `<div class="panel-action-item">
        <span class="panel-action-status ${statusClass}"></span>
        <span>${a.description || a.type || ''}</span>
      </div>`;
    }).join('');
  }

  // Type-specific fields
  let typeFields = '';
  if (type === 'milestone') {
    const done = nodeData.slicesDone ?? 0;
    const total = nodeData.slicesTotal ?? 0;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    typeFields = `
      <div class="panel-field">
        <div class="panel-label">Type</div>
        <div class="panel-value">Milestone</div>
      </div>
      <div class="panel-field">
        <div class="panel-label">Progress</div>
        <div class="panel-progress-bar">
          <div class="panel-progress-fill" style="width:${pct}%;background:${color};"></div>
        </div>
        <div class="panel-value">${done}/${total} slices (${pct}%)</div>
      </div>
      ${nodeData.phase ? `<div class="panel-field">
        <div class="panel-label">Phase</div>
        <div class="panel-value" style="text-transform:capitalize;">${nodeData.phase}</div>
      </div>` : ''}
    `;
  } else if (type === 'slice') {
    typeFields = `
      <div class="panel-field">
        <div class="panel-label">Type</div>
        <div class="panel-value">Slice</div>
      </div>
      ${nodeData.currentAction ? `<div class="panel-field">
        <div class="panel-label">Action</div>
        <div class="panel-value">${nodeData.currentAction}</div>
      </div>` : ''}
      ${nodeData.children && nodeData.children.length ? `<div class="panel-field">
        <div class="panel-label">Tasks</div>
        <div class="panel-value">${nodeData.children.length} child task(s)</div>
      </div>` : ''}
    `;
  } else if (type === 'agent' || type === 'subagent') {
    const label = type === 'subagent' ? 'Task' : 'Agent';
    typeFields = `
      <div class="panel-field">
        <div class="panel-label">Type</div>
        <div class="panel-value">${label}</div>
      </div>
      ${nodeData.model ? `<div class="panel-field">
        <div class="panel-label">Model</div>
        <div class="panel-model">${nodeData.model}</div>
      </div>` : ''}
      ${nodeData.estimate ? `<div class="panel-field">
        <div class="panel-label">Estimate</div>
        <div class="panel-value">${nodeData.estimate}</div>
      </div>` : ''}
      ${nodeData.currentAction ? `<div class="panel-field">
        <div class="panel-label">Current Action</div>
        <div class="panel-value">${nodeData.currentAction}</div>
      </div>` : ''}
      ${nodeData.lastAction ? `<div class="panel-field">
        <div class="panel-label">Last Action</div>
        <div class="panel-value">${nodeData.lastAction}</div>
      </div>` : ''}
      ${nodeData.phase ? `<div class="panel-field">
        <div class="panel-label">Phase</div>
        <div class="panel-value" style="text-transform:capitalize;">${nodeData.phase}</div>
      </div>` : ''}
    `;
  } else {
    typeFields = `
      <div class="panel-field">
        <div class="panel-label">Type</div>
        <div class="panel-value" style="text-transform:capitalize;">${type}</div>
      </div>
    `;
  }

  const statusField = `
    <div class="panel-field">
      <div class="panel-label">Status</div>
      <div class="panel-value" style="color:${color};text-transform:capitalize;">${nodeData.status || 'unknown'}</div>
    </div>
  `;

  panel.innerHTML = `
    <div class="panel-header">
      <span class="panel-name">${nodeData.name || 'unnamed'}</span>
      <span class="panel-status" style="background:${_hexToRgba(color, 0.2)};color:${color};">${nodeData.status || 'unknown'}</span>
      <button class="panel-close" id="panel-close">&times;</button>
    </div>
    ${statusField}
    ${typeFields}
    ${actionsHtml ? `<div class="panel-actions"><div class="panel-label">Recent Actions</div>${actionsHtml}</div>` : ''}
  `;

  panel.classList.add('visible');
  panel.style.left = 'auto';
  panel.style.top = 'auto';

  // Position panel near clicked squid (defer to next frame so panel is rendered)
  requestAnimationFrame(() => {
    const panelRect = panel.getBoundingClientRect();
    let left = (nodeData.x || 0) + 20;
    let top = (nodeData.y || 0) - panelRect.height / 2;

    if (left + panelRect.width > window.innerWidth - 16) {
      left = (nodeData.x || 0) - panelRect.width - 20;
    }
    if (left < 16) left = 16;
    if (top + panelRect.height > window.innerHeight - 16) {
      top = window.innerHeight - panelRect.height - 16;
    }
    if (top < 16) top = 16;

    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
  });

  // Close handler
  const closeBtn = document.getElementById('panel-close');
  closeBtn.addEventListener('click', () => {
    panel.classList.remove('visible');
    scene.handleClick(null);
  });
}

// Start scene
scene.start();

// Layout toggle — keyboard shortcut (works without canvas focus)
window.addEventListener('keydown', (e) => {
  if (e.key === 'l' || e.key === 'L') {
    const newMode = toggleLayoutMode();
    console.log(`[Squid-Map] Layout: ${newMode === LAYOUT_MODE.LAYERED ? 'Layered' : 'Force-directed'}`);

    // Re-layout with current mode
    const nodes = scene.data?.nodes || [];
    const connections = scene.data?.connections || [];
    const w = scene.canvas.width;
    const h = scene.canvas.height;

    if (newMode === LAYOUT_MODE.LAYERED) {
      import('./render/layout.js').then(({ computeLayeredLayout }) => {
        computeLayeredLayout(nodes, connections, w, h);
        nodes.forEach((nodeData) => {
          const squid = scene.nodes.get(nodeData.id);
          if (squid) {
            squid.data.x = nodeData.x;
            squid.data.y = nodeData.y;
          }
        });
      });
    } else {
      import('./render/layout.js').then(({ computeLayout }) => {
        computeLayout(nodes, connections, w, h);
        nodes.forEach((nodeData) => {
          const squid = scene.nodes.get(nodeData.id);
          if (squid) {
            squid.data.x = nodeData.x;
            squid.data.y = nodeData.y;
          }
        });
      });
    }
  }
});

// Click handler — show detail panel
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const nodeData = scene.handleClick(x, y);
  if (nodeData) {
    showDetail(nodeData);
  } else {
    panel.classList.remove('visible');
  }
});
      