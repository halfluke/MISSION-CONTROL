/**
 * Layout algorithms for positioning squid nodes on canvas.
 *
 * - computeLayeredLayout: DAG-aware layered layout (milestones→slices→tasks)
 * - computeLayout: original force-directed layout (fallback/optional)
 *
 * Both adapt their complexity based on node count to maintain >15fps
 * even with 50+ nodes.
 */

import { NODE_TYPE } from './data-model.js';

// ── Constants ────────────────────────────────────────────────────────────────

const REPULSION = 12000;
const REPULSION_Y = 1.5; // Extra vertical spread multiplier
const ATTRACTION = 0.005;
const DAMPING = 0.65;
const MAX_ITERATIONS = 150;

// ── Layout modes ─────────────────────────────────────────────────────────────

export const LAYOUT_MODE = {
  LAYERED: 'layered',
  FORCE: 'force',
};

export let currentLayoutMode = LAYOUT_MODE.FORCE;

/**
 * Toggle layout mode (for keyboard shortcut).
 * @returns {string} New layout mode
 */
export function toggleLayoutMode() {
  return currentLayoutMode === LAYOUT_MODE.FORCE
    ? (currentLayoutMode = LAYOUT_MODE.LAYERED)
    : (currentLayoutMode = LAYOUT_MODE.FORCE);
}

/**
 * Compute a layered DAG-aware layout.
 *
 * Assigns nodes to layers based on type:
 *   L0: milestones
 *   L1: slices
 *   L2: tasks (agents/subagents)
 *
 * @param {Object[]} nodes - Array of node data (mutated to add x/y)
 * @param {{from:string,to:string}[]} connections - Edge list
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 */
export function computeLayeredLayout(nodes, connections, width, height) {
  if (nodes.length === 0) return;

  const margin = 60;
  const layerOrder = {
    [NODE_TYPE.MILESTONE]: 0,
    [NODE_TYPE.SLICE]: 1,
    [NODE_TYPE.AGENT]: 2,
    [NODE_TYPE.SUBAGENT]: 3,
    [NODE_TYPE.COMMIT]: 4,
  };

  // Group nodes by layer
  const byLayer = new Map();
  for (const node of nodes) {
    const layer = layerOrder[node.type] ?? 3;
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer).push(node);
  }

  // Assign y positions based on layer bands
  const layerKeys = [...byLayer.keys()].sort((a, b) => a - b);
  const bandHeight = (height - margin * 2) / Math.max(layerKeys.length, 1);

  for (const layerKey of layerKeys) {
    const layerNodes = byLayer.get(layerKey);
    const bandY = margin + layerKey * bandHeight;
    const centerY = bandY + bandHeight / 2;

    // Distribute x within layer with jitter
    const count = layerNodes.length;
    const availableW = width * 0.7;
    const step = count > 1 ? availableW / (count - 1) : width / 2;
    const startX = (width - availableW) / 2 + margin;

    for (let i = 0; i < count; i++) {
      const node = layerNodes[i];
      node.x = startX + i * step + (Math.random() - 0.5) * 20;
      node.y = centerY + (Math.random() - 0.5) * 15;
      node.vx = 0;
      node.vy = 0;
    }
  }

  // Edge attraction to keep connected nodes vertically aligned
  const nodeMap = new Map();
  nodes.forEach((node) => { nodeMap.set(node.id, node); });

  for (let i = 0; i < connections.length; i++) {
    const { from, to } = connections[i];
    const a = nodeMap.get(from);
    const b = nodeMap.get(to);
    if (!a || !b) continue;

    const xDiff = a.x - b.x;
    if (Math.abs(xDiff) > 30) {
      const pull = xDiff * 0.05;
      a.vx -= pull;
      b.vx += pull;
    }
  }

  for (const node of nodes) {
    node.x += node.vx || 0;
    node.x = Math.max(margin, Math.min(width - margin, node.x));
    delete node.vx;
    delete node.vy;
  }
}

/**
 * Compute adaptive iteration count based on node count.
 * Keeps layout under budget even for large graphs.
 *   ≤30 nodes → 150 iters   (full quality)
 *   ≤60 nodes →  80 iters   (still smooth)
 *   >60 nodes →  50 iters   (fast enough)
 * @param {number} n - Number of nodes
 * @returns {number} Iteration count
 */
function adaptiveIterations(n) {
  if (n <= 30) return MAX_ITERATIONS;
  if (n <= 60) return 80;
  return 50;
}

/**
 * Run force-directed layout to compute x/y for each node.
 * Adapts iteration count to node count to maintain >15fps with 50+ nodes.
 * @param {Object[]} nodes - Array of node data (mutated to add x/y)
 * @param {{from:string,to:string}[]} connections - Edge list
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 */
export function computeLayout(nodes, connections, width, height) {
  const n = nodes.length;
  if (n === 0) return;

  const iterations = adaptiveIterations(n);
  const margin = 80;
  const areaW = width - margin * 2;
  const areaH = height - margin * 2;

  const nodeMap = new Map();
  nodes.forEach((node, i) => {
    // Fresh spread: cluster horizontally, spread vertically
    const xSpread = areaW * 0.7;
    const xCenter = width / 2;
    node.x = xCenter - xSpread / 2 + ((i + 0.5) / n) * xSpread;
    node.y = margin + (0.1 + Math.random() * 0.8) * areaH;
    node.vx = 0;
    node.vy = 0;
    nodeMap.set(node.id, node);
  });

  for (let iter = 0; iter < iterations; iter++) {
    const temp = 1 - iter / iterations; // Cooling

    // Reset velocities at the start of each iteration
    for (let i = 0; i < n; i++) {
      nodes[i].vx = 0;
      nodes[i].vy = 0;
    }

    // Repulsion between all pairs
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = REPULSION / (dist * dist);
        const fx = (dx / dist) * force * 0.6;          // Tighter horizontal
        const fy = (dy / dist) * force * REPULSION_Y;  // Extra vertical spread
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    // Attraction along edges
    connections.forEach((c) => {
      const a = nodeMap.get(c.from);
      const b = nodeMap.get(c.to);
      if (!a || !b) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = dist * ATTRACTION;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    });

    // Apply velocities with damping and cooling
    nodes.forEach((node) => {
      node.vx *= DAMPING * temp;
      node.vy *= DAMPING * temp;
      node.x += node.vx;
      node.y += node.vy;

      // Soft boundary — push back toward center with increasing force
      const boundaryStiffness = 0.3;
      if (node.x < margin) { node.vx += boundaryStiffness * (margin - node.x); node.x = margin; }
      if (node.x > width - margin) { node.vx += boundaryStiffness * (width - margin - node.x); node.x = width - margin; }
      if (node.y < margin) { node.vy += boundaryStiffness * (margin - node.y); node.y = margin; }
      if (node.y > height - margin) { node.vy += boundaryStiffness * (height - margin - node.y); node.y = height - margin; }
    });
  }

  // Clean up temp properties
  nodes.forEach((node) => {
    delete node.vx;
    delete node.vy;
  });
}
