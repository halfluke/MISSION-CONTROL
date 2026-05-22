/**
 * Tentacle — renders animated bezier curves between connected squid nodes.
 * Multiple parallel tentacles per connection with sine-wave oscillation.
 */
import { STATUS_COLORS } from './data-model.js';

const NUM_TENTACLES = 3;
const AMPLITUDE = 12; // Pixel oscillation amplitude
const SPEED = 1.8; // Radians per second
const WIDTH_BASE = 2.5; // Base stroke width
const WIDTH_TAPER = 0.8; // Taper factor at end

/**
 * @typedef {Object} TentacleData
 * @property {string} from - Source node ID
 * @property {string} to - Target node ID
 * @property {string} status - "active", "idle", "error"
 */

export class Tentacle {
  /**
   * @param {TentacleData} data - Connection data
   */
  constructor(data) {
    this.data = data;
  }

  /**
   * Render tentacle curves between two points.
   * For commit-order connections, renders a straight arrow instead.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x1 - Source X
   * @param {number} y1 - Source Y
   * @param {number} x2 - Target X
   * @param {number} y2 - Target Y
   * @param {number} time - Animation time in seconds
   */
  render(ctx, x1, y1, x2, y2, time) {
    // Commit-order connections: straight arrow with arrowhead
    if (this.data.type === 'commit-order') {
      this._renderArrow(ctx, x1, y1, x2, y2);
      return;
    }

    const color = this._color();
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    // Perpendicular direction for offset control points
    const nx = -dy / dist;
    const ny = dx / dist;

    for (let i = 0; i < NUM_TENTACLES; i++) {
      const phase = i * (Math.PI / (NUM_TENTACLES - 1 || 1));
      const offset = Math.sin(time * SPEED + phase) * AMPLITUDE;

      // Control points for bezier curve
      const cp1x = x1 + dx * 0.3 + nx * offset;
      const cp1y = y1 + dy * 0.3 + ny * offset;
      const cp2x = x1 + dx * 0.7 + nx * offset * 0.7;
      const cp2y = y1 + dy * 0.7 + ny * offset * 0.7;

      // Alpha varies by status
      let alpha = 0.5;
      if (this.data.status === 'active') {
        // Pulsing for active connections
        alpha = 0.4 + Math.sin(time * SPEED * 1.5 + phase) * 0.3;
      } else if (this.data.status === 'error') {
        alpha = 0.6;
      }

      ctx.save();
      ctx.strokeStyle = this._hexToRgba(color, alpha);

      // Tapered width: wider near source, narrower at target
      const lineWidth = WIDTH_BASE * (1 - (i / (NUM_TENTACLES - 1 || 1)) * WIDTH_TAPER);
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
      ctx.stroke();
      ctx.restore();
    }

    // Draw small dot at target end
    ctx.save();
    ctx.fillStyle = this._hexToRgba(color, 0.7);
    ctx.beginPath();
    ctx.arc(x2, y2, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Render a straight arrow from (x1, y1) to (x2, y2).
   * Stops short of the target centroid so the arrowhead doesn't overlap the squid body.
   */
  _renderArrow(ctx, x1, y1, x2, y2) {
    const arrowColor = '#facc15'; // yellow to match commits
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    // Direction unit vector
    const ux = dx / dist;
    const uy = dy / dist;

    // Stop the line short so arrowhead sits just outside the target squid body
    const margin = 28; // approximate commit squid radius + padding
    const lineEndX = x2 - ux * margin;
    const lineEndY = y2 - uy * margin;

    // Arrowhead position (at the margin boundary)
    const headX = lineEndX;
    const headY = lineEndY;
    const headLen = 8;
    const headAngle = 0.45; // radians

    ctx.save();
    ctx.strokeStyle = this._hexToRgba(arrowColor, 0.6);
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';

    // Draw line
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(lineEndX, lineEndY);
    ctx.stroke();

    // Draw arrowhead
    const angle = Math.atan2(uy, ux);
    ctx.fillStyle = this._hexToRgba(arrowColor, 0.8);
    ctx.beginPath();
    ctx.moveTo(headX, headY);
    ctx.lineTo(
      headX - headLen * Math.cos(angle - headAngle),
      headY - headLen * Math.sin(angle - headAngle)
    );
    ctx.lineTo(
      headX - headLen * Math.cos(angle + headAngle),
      headY - headLen * Math.sin(angle + headAngle)
    );
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  _color() {
    return STATUS_COLORS[this.data.status] || STATUS_COLORS.idle;
  }

  _hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
}
