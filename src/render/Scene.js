/**
 * Scene — orchestrator for the squid visualization.
 *
 * Manages the render loop, layout, node/tentacle instances,
 * click hit-testing, and detail panel state.
 */
import { SquidNode } from './SquidNode.js';
import { Tentacle } from './Tentacle.js';
import { computeLayout, computeLayeredLayout, toggleLayoutMode, currentLayoutMode, LAYOUT_MODE } from './layout.js';
import { NODE_TYPE } from './data-model.js';

const TARGET_FPS = 30;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

export class Scene {
  /**
   * @param {HTMLCanvasElement} canvas - The canvas element to render on
   * @param {Object} data - SceneData from data-model
   */
  constructor(canvas, data) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.data = data;
    this.nodes = new Map(); // id -> SquidNode
    this.tentacles = [];
    this.selectedNodeId = null;
    this.startTime = performance.now();

    this._resizeObserver = null;
    this._rafId = null;
    this._lastFrameTime = 0;
    this._frameCount = 0;
    this._fps = 0;
    this._fpsAccum = 0;

    this._buildInstances(data);
    this._setupResize();
    this._setupInteraction();
  }

  /**
   * Update scene data (called when snapshot file changes).
   * @param {Object} newData - Updated SceneData
   */
  update(newData) {
    this.data = newData;
    this.selectedNodeId = null;
    this._buildInstances(newData);
  }

  /**
   * Start the render loop.
   */
  start() {
    if (this._rafId) return;
    this._lastFrameTime = performance.now();
    this._loop();
  }

  /**
   * Stop the render loop.
   */
  stop() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  _buildInstances(data) {
    this.nodes.clear();
    this.tentacles = [];

    // Compute layout
    const nodes = data.nodes;
    const connections = data.connections || [];
    const w = this.canvas.width;
    const h = this.canvas.height;

    if (currentLayoutMode === LAYOUT_MODE.LAYERED) {
      computeLayeredLayout(nodes, connections, w, h);
    } else {
      computeLayout(nodes, connections, w, h);
    }

    // Build squid instances
    data.nodes.forEach((nodeData) => {
      const state = {
        selected: nodeData.id === this.selectedNodeId,
        hoverScale: 1,
      };
      const squid = new SquidNode(nodeData, state);
      this.nodes.set(nodeData.id, squid);
    });

    // Build tentacle instances
    (data.connections || []).forEach((conn) => {
      this.tentacles.push(new Tentacle(conn));
    });
  }

  _loop = () => {
    const now = performance.now();
    const delta = now - this._lastFrameTime;

    if (delta >= FRAME_INTERVAL) {
      this._lastFrameTime = now;
      this._frameCount++;
      this._fpsAccum += delta;

      if (this._fpsAccum >= 1000) {
        this._fps = Math.round((this._frameCount * 1000) / this._fpsAccum);
        this._frameCount = 0;
        this._fpsAccum = 0;
      }

      this._render();
    }

    this._rafId = requestAnimationFrame(this._loop);
  };

  _render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const time = (performance.now() - this.startTime) / 1000;

    // Clear with dark background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    // Draw subtle grid
    this._drawGrid(ctx, w, h);

    // Draw tentacles first (behind squids)
    this.tentacles.forEach((tentacle) => {
      const fromNode = this.nodes.get(tentacle.data.from);
      const toNode = this.nodes.get(tentacle.data.to);
      if (!fromNode || !toNode) return;

      const from = fromNode.centroid();
      const to = toNode.centroid();
      tentacle.render(ctx, from.x, from.y, to.x, to.y, time);
    });

    // Draw squids
    this.nodes.forEach((squid) => {
      squid.render(ctx, time);
    });

    // Debug overlay
    this._drawDebug(ctx, w, h);
  }

  _drawGrid(ctx, w, h) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    const spacing = 40;
    for (let x = 0; x < w; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawDebug(ctx, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`${this._fps} fps`, w - 10, 10);
    ctx.fillText(`${this.nodes.size} nodes`, w - 10, 24);
    ctx.fillText(`${this.tentacles.length} connections`, w - 10, 38);
    ctx.restore();
  }

  _setupResize() {
    let resizeTimeout = null;
    let lastW = 0;
    let lastH = 0;
    const resizeHandler = () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      // Longer debounce for large graphs to avoid layout thrashing
      const debounceMs = this.nodes.size > 50 ? 200 : 100;
      resizeTimeout = setTimeout(() => {
        const newW = this.canvas.clientWidth;
        const newH = this.canvas.clientHeight;
        // Skip if dimensions haven't actually changed
        if (newW === lastW && newH === lastH) return;
        lastW = newW;
        lastH = newH;

        this.canvas.width = newW;
        this.canvas.height = newH;
        if (this.data && this.data.nodes) {
          const nodes = this.data.nodes;
          const connections = this.data.connections || [];
          const w = this.canvas.width;
          const h = this.canvas.height;

          if (currentLayoutMode === LAYOUT_MODE.LAYERED) {
            computeLayeredLayout(nodes, connections, w, h);
          } else {
            computeLayout(nodes, connections, w, h);
          }

          // Update positions on existing instances
          nodes.forEach((nodeData) => {
            const squid = this.nodes.get(nodeData.id);
            if (squid) {
              squid.data.x = nodeData.x;
              squid.data.y = nodeData.y;
            }
          });
        }
      }, 100);
    };
    this._resizeObserver = new ResizeObserver(resizeHandler);
    this._resizeObserver.observe(this.canvas.parentElement);
  }

  _setupInteraction() {
    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.handleClick(x, y);
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.handleHover(x, y);
    });
  }

  /**
   * Handle click at canvas coordinates.
   * @param {number} x
   * @param {number} y
   * @returns {Object|null} The clicked node data, or null
   */
  handleClick(x, y) {
    let clicked = null;

    // Reverse order for top-most first
    const nodeIds = Array.from(this.nodes.keys()).reverse();
    for (const id of nodeIds) {
      const squid = this.nodes.get(id);
      if (squid.hitTest(x, y)) {
        clicked = id;
        break;
      }
    }

    // Update selection state
    this.selectedNodeId = clicked;
    this.nodes.forEach((squid) => {
      squid.state.selected = squid.data.id === clicked;
    });

    if (clicked) {
      return this.nodes.get(clicked).data;
    }
    return null;
  }

  /**
   * Handle hover at canvas coordinates (for cursor feedback).
   * @param {number} x
   * @param {number} y
   */
  handleHover(x, y) {
    let hovering = false;
    this.nodes.forEach((squid) => {
      const isHit = squid.hitTest(x, y);
      squid.state.hoverScale = isHit ? 1.08 : 1;
      if (isHit) hovering = true;
    });
    this.canvas.style.cursor = hovering ? 'pointer' : 'default';
  }

  /**
   * Get the detail panel data for the selected node.
   * @returns {Object|null}
   */
  getSelectedNode() {
    if (!this.selectedNodeId) return null;
    return this.nodes.get(this.selectedNodeId)?.data || null;
  }
}
