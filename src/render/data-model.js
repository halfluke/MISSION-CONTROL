/**
 * Data model for Squid-Map rendering.
 *
 * These interfaces define the shape of data the rendering engine consumes.
 * Mock data uses this shape; real data from the GSD snapshot adapter maps to it.
 */

// Node types rendered on canvas
export const NODE_TYPE = {
  AGENT: 'agent',
  SUBAGENT: 'subagent',
  MILESTONE: 'milestone',
  SLICE: 'slice',
};

// Agent statuses mapped to colors
export const STATUS_COLORS = {
  active: '#4ade80',    // green
  idle: '#60a5fa',       // blue
  error: '#f87171',      // red
  waiting: '#9ca3af',    // gray
  completing: '#fbbf24', // amber
  pending: '#6b7280',    // gray-500
};

// Type-based base colors — milestones, slices, and tasks get distinct palettes
// so you can tell the hierarchy at a glance.
export const TYPE_COLORS = {
  [NODE_TYPE.MILESTONE]: '#c084fc', // purple
  [NODE_TYPE.SLICE]:     '#38bdf8', // sky blue
  [NODE_TYPE.AGENT]:     '#4ade80', // green
  [NODE_TYPE.SUBAGENT]:  '#4ade80', // green
};

/**
 * @typedef {Object} SquidNodeData
 * @property {string} id - Unique node ID
 * @property {string} name - Display name
 * @property {string} type - NODE_TYPE enum
 * @property {string} status - Current status key (matches STATUS_COLORS)
 * @property {string} [model] - Model identifier (e.g. "deepseek-v4-pro")
 * @property {string[]} [children] - Child node IDs (for tentacle connections)
 * @property {string} [parentId] - Parent node ID (for subagents)
 * @property {number} [x] - Canvas X position (assigned by layout)
 * @property {number} [y] - Canvas Y position (assigned by layout)
 * @property {ActionData[]} [actions] - Recent actions for detail panel
 * @property {string} [currentAction] - What the agent is doing now
 * @property {string} [lastAction] - What the agent did last
 * @property {string} [phase] - GSD phase (e.g. "planning", "execution")
 * @property {string} [milestoneId] - Associated milestone (for milestones/slices)
 * @property {number} [slicesDone] - Slices completed (for milestones)
 * @property {number} [slicesTotal] - Total slices (for milestones)
 */

/**
 * @typedef {Object} ActionData
 * @property {string} type - Action type (e.g. "dispatch-match", "unit-start")
 * @property {string} description - Human-readable description
 * @property {string} status - "success", "failed", "running"
 * @property {number} [timestamp] - When action occurred
 */

/**
 * @typedef {Object} TentacleData
 * @property {string} from - Source node ID
 * @property {string} to - Target node ID
 * @property {string} status - Connection status ("active", "idle", "error")
 */

/**
 * @typedef {Object} SceneData
 * @property {SquidNodeData[]} nodes - All nodes in the scene
 * @property {TentacleData[]} connections - All tentacle connections
 * @property {number} lastUpdate - Timestamp of last data update
 */
