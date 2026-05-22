/**
 * SquidNode — renders a single squid on Canvas 2D.
 *
 * Body is an organic shape: elliptical head with taper, colored by status.
 * Includes model badge text, agent name, and hit-testing.
 */
import { STATUS_COLORS, NODE_TYPE, TYPE_COLORS } from './data-model.js';

// ── Size configs per node type (bigger squids) ───────────────────────────────

// Max characters for node names on canvas — 30 chars is a practical middle
// between readability and preventing text overlap between nodes
const NAME_TRUNCATE = 30;

export const SIZE_CONFIGS = {
  [NODE_TYPE.MILESTONE]: { rx: 60, ry: 45, nameFont: 'bold 15px', badgeFont: '12px' },
  [NODE_TYPE.SLICE]:     { rx: 44, ry: 33, nameFont: 'bold 14px', badgeFont: '11px' },
  [NODE_TYPE.AGENT]:     { rx: 48, ry: 35, nameFont: 'bold 14px', badgeFont: '11px' },
  [NODE_TYPE.SUBAGENT]:  { rx: 30, ry: 22, nameFont: 'bold 12px', badgeFont: '10px' },
  [NODE_TYPE.COMMIT]:    { rx: 24, ry: 18, nameFont: 'bold 10px', badgeFont: '9px' },
};

const DEFAULT_CONFIG = SIZE_CONFIGS[NODE_TYPE.AGENT];
const GLOW_PULSE_SPEED = 2; // radians per second
const GLOW_PULSE_AMPLITUDE = 8;

/**
 * @typedef {Object} SquidRenderState
 * @property {boolean} selected - Is this squid currently selected
 * @property {number} hoverScale - Scale factor when hovering
 */

export class SquidNode {
  /**
   * @param {Object} data - SquidNodeData from data-model
   * @param {SquidRenderState} state - Render state
   */
  constructor(data, state = {}) {
    this.data = data;
    this.state = { selected: false, hoverScale: 1, ...state };
    this._path = null; // Cached path for hit testing
    // Get size config for this node type
    const config = SIZE_CONFIGS[data.type];
    this.config = config ? config : DEFAULT_CONFIG;
  }

  /**
   * Render the squid body and labels.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} time - Animation time in seconds
   */
  render(ctx, time) {
    const { x, y } = this.data;
    let bodyColor = this._bodyColor();
    const scale = this.state.hoverScale;
    const { rx, ry } = this.config;

    // For completed nodes, use type color instead of status color
    const isCompleted = this.data.status === 'complete' || this.data.status === 'done' || this.data.done;
    if (isCompleted) {
      bodyColor = TYPE_COLORS[this.data.type] || TYPE_COLORS[NODE_TYPE.AGENT];
    }

    // Determine if we should flash (running = active status)
    const isRunning = this.data.status === 'active';

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // Flashing effect for running nodes - flash with type color
    if (isRunning) {
      const flashSpeed = 8;
      const flash = Math.sin(time * flashSpeed);
      const flashAlpha = 0.3 + flash * 0.25;
      // Flash overlay using the type color
      ctx.fillStyle = this._hexToRgba(bodyColor, flashAlpha);
      ctx.beginPath();
      ctx.arc(0, 0, rx * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Glow effect for active nodes
    if (this.data.status === 'active') {
      const pulse = Math.sin(time * GLOW_PULSE_SPEED) * 0.5 + 0.5;
      const glowAlpha = 0.15 + pulse * 0.2;
      const glowRadius = rx + GLOW_PULSE_AMPLITUDE * (0.5 + pulse * 0.5);
      const gradient = ctx.createRadialGradient(0, 0, rx * 0.5, 0, 0, glowRadius);
      gradient.addColorStop(0, this._hexToRgba(bodyColor, glowAlpha));
      gradient.addColorStop(1, this._hexToRgba(bodyColor, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Squid body — organic teardrop shape
    this._drawBody(ctx, bodyColor, rx, ry);
    this._path = this._buildBodyPath(ctx, rx, ry);

    // Selection ring
    if (this.state.selected) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Type-specific border treatments
    this._drawBorder(ctx, rx, ry);

    // Draw status text inside the squid
    this._drawStatusText(ctx, rx, ry);

    // Commits skip the status dot
    if (this.data.type !== NODE_TYPE.COMMIT) {
      this._drawStatusDot(ctx, rx, ry, isCompleted);
    }

    // Labels - LOCAL coords after translate
    this._drawLabels(ctx, bodyColor, rx, ry);

    ctx.restore();
  }

  /**
   * Draw status text inside the squid body.
   */
  _drawStatusText(ctx, rx, ry) {
    let statusText = '';
    const status = this.data.status;

    // Commits: show the short commit hex inside the body
    if (this.data.type === NODE_TYPE.COMMIT) {
      statusText = this.data.commitHash || '';
    }
    // All other node types: show status label
    else if (status === 'complete' || status === 'done' || this.data.done) {
      statusText = 'COMPLETED';
    } else if (status === 'active') {
      statusText = 'RUNNING';
    } else if (status === 'pending' || status === 'idle' || status === 'waiting') {
      statusText = 'PENDING';
    }

    if (!statusText) return;

    ctx.save();
    // Commits use dark text inside yellow body; others use red
    if (this.data.type === NODE_TYPE.COMMIT) {
      ctx.fillStyle = '#1a1a1a';
    } else {
      ctx.fillStyle = '#ef4444';
    }
    // Use bold and a slightly larger size (0.4x instead of 0.35x)
    ctx.font = `bold ${Math.max(10, Math.floor(rx * 0.4))}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Position in center of body (slightly below eyes)
    ctx.fillText(statusText, 0, ry * 0.35);
    ctx.restore();
  }

  /**
   * Draw type-specific border treatments.
   */
  _drawBorder(ctx, rx, ry) {
    const { type } = this.data;

    ctx.save();
    ctx.translate(0, 0);

    if (type === NODE_TYPE.MILESTONE) {
      // Diamond accent - thin diamond outline around the body
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const s = Math.max(rx, ry) + 6;
      ctx.moveTo(0, -s);
      ctx.lineTo(s, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s, 0);
      ctx.closePath();
      ctx.stroke();
    } else if (type === NODE_TYPE.SLICE) {
      // Double border ring
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx + 8, ry + 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 0, rx + 11, ry + 11, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (type === NODE_TYPE.COMMIT) {
      // Thin dashed ring to distinguish commits
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx + 5, ry + 5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Tasks (AGENT/SUBAGENT) get no extra border - solid body is enough

    ctx.restore();
  }

  /**
   * Draw a small status indicator dot above-right of the squid body.
   * Uses LOCAL coordinates (relative to squid origin).
   */
  _drawStatusDot(ctx, rx, ry, isCompleted) {
    const dotRadius = 3;
    const dotX = rx + 4;
    const dotY = -ry - 4;
    // Use green dot for completed nodes (bright signal)
    let dotColor;
    if (isCompleted) {
      dotColor = '#4ade80';
    } else {
      dotColor = STATUS_COLORS[this.data.status] || STATUS_COLORS.idle;
    }
    ctx.save();
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Draw the organic squid body shape.
   */
  _drawBody(ctx, color, rx, ry) {
    // Main body: elliptical head with tentacle nubs at bottom
    ctx.beginPath();
    ctx.moveTo(0, -ry);

    // Top curve
    ctx.bezierCurveTo(
      -rx, -ry,
      -rx, ry * 0.2,
      -rx * 0.6, ry * 0.5
    );

    // Left taper
    ctx.bezierCurveTo(
      -rx * 0.3, ry * 0.8,
      -rx * 0.15, ry,
      0, ry * 1.1
    );

    // Right taper
    ctx.bezierCurveTo(
      rx * 0.15, ry,
      rx * 0.3, ry * 0.8,
      rx * 0.6, ry * 0.5
    );

    // Bottom curve
    ctx.bezierCurveTo(
      rx, ry * 0.2,
      rx, -ry,
      0, -ry
    );
    ctx.closePath();

    // Fill with gradient
    const gradient = ctx.createLinearGradient(0, -ry, 0, ry);
    gradient.addColorStop(0, this._lighten(color, 30));
    gradient.addColorStop(1, color);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Eyes (scale with size)
    const eyeY = -ry * 0.15;
    const eyeSpacing = rx * 0.23;
    const eyeRadius = rx * 0.11;
    const pupilRadius = eyeRadius * 0.6;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-eyeSpacing, eyeY, eyeRadius, 0, Math.PI * 2);
    ctx.arc(eyeSpacing, eyeY, eyeRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(-eyeSpacing + eyeRadius * 0.25, eyeY, pupilRadius, 0, Math.PI * 2);
    ctx.arc(eyeSpacing + eyeRadius * 0.25, eyeY, pupilRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Build a Path2D for hit testing.
   */
  _buildBodyPath(ctx, rx, ry) {
    const path = new Path2D();
    path.moveTo(0, -ry);
    path.bezierCurveTo(
      -rx, -ry,
      -rx, ry * 0.2,
      -rx * 0.6, ry * 0.5
    );
    path.bezierCurveTo(
      -rx * 0.3, ry * 0.8,
      -rx * 0.15, ry,
      0, ry * 1.1
    );
    path.bezierCurveTo(
      rx * 0.15, ry,
      rx * 0.3, ry * 0.8,
      rx * 0.6, ry * 0.5
    );
    path.bezierCurveTo(
      rx, ry * 0.2,
      rx, -ry,
      0, -ry
    );
    path.closePath();
    return path;
  }

  /**
   * Draw name above the squid.
   * Uses LOCAL coordinates (relative to squid origin).
   */
  _drawLabels(ctx, color, rx, ry) {
    const config = this.config;

    // Node name (truncated to prevent canvas clutter)
    const displayName = this._shortenName(this.data.name);

    ctx.save();
    ctx.fillStyle = '#e4e4e7';
    ctx.font = config.nameFont + ' system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const nameOffsetY = -(ry + 8);
    ctx.fillText(displayName, 0, nameOffsetY);
    ctx.restore();

    // Type-specific labels (only for milestones showing slice count)
    if (this.data.type === NODE_TYPE.MILESTONE) {
      ctx.save();
      ctx.fillStyle = '#a1a1aa';
      ctx.font = '10px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const labelY = ry + 18;
      const label = `${this.data.slicesDone ?? 0}/${this.data.slicesTotal ?? 0} slices`;
      if (label) ctx.fillText(label, 0, labelY);
      ctx.restore();
    }
    // Note: slices and tasks no longer show currentAction label outside
    // since status is now displayed inside the squid body
  }

  /**
   * Hit test: is point (px, py) inside this squid's body?
   * Uses expanded bounding box for easier clicking.
   */
  hitTest(px, py) {
    const { x, y } = this.data;
    const { rx, ry } = this.config;
    const dx = px - x;
    const dy = py - y;
    // Elliptical hit area, expanded for easier clicking
    const nx = dx / (rx * 1.3);
    const ny = dy / (ry * 1.4);
    return (nx * nx + ny * ny) <= 1;
  }

  /**
   * Get the centroid of this squid for tentacle connections.
   */
  centroid() {
    return { x: this.data.x, y: this.data.y };
  }

  _bodyColor() {
    // Use type-based colors: type color for running (active), grey for pending
    // Completed nodes keep their type color (handled in render)
    const status = this.data.status;
    if (status === 'error') return STATUS_COLORS.error;
    // Running (active) = use type color
    if (status === 'active') return TYPE_COLORS[this.data.type] || TYPE_COLORS[NODE_TYPE.AGENT];
    // Completing = type color
    if (status === 'completing') return TYPE_COLORS[this.data.type] || TYPE_COLORS[NODE_TYPE.AGENT];
    // Pending/idle/waiting: grey
    if (status === 'pending' || status === 'idle' || status === 'waiting') {
      return STATUS_COLORS.pending;
    }
    // complete/done: use type color (will be applied in render())
    return TYPE_COLORS[this.data.type] || TYPE_COLORS[NODE_TYPE.AGENT];
  }

  _shortenName(name, maxChars) {
    if (!name) return '';
    maxChars = maxChars || NAME_TRUNCATE;
    if (name.length <= maxChars) return name;
    return name.slice(0, maxChars - 1) + '…';
  }

  _hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  _lighten(hex, percent) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    r = Math.min(255, r + percent);
    g = Math.min(255, g + percent);
    b = Math.min(255, b + percent);
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  }

}
