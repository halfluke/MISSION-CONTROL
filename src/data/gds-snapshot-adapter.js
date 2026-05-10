/**
 * GSD Snapshot Adapter — transforms GSD visualizer state into SceneData.
 *
 * Reads the versioned JSON snapshot from S02's extension and converts it
 * to the rendering engine's SquidNodeData[] + TentacleData[] format.
 *
 * GSD snapshot shape (from loadVisualizerData):
 *   { version: 1, milestones: [{ id, title, status, dependsOn, slices: [...] }],
 *     phase: string, remainingSliceCount, ... }
 *
 * SceneData shape:
 *   { nodes: SquidNodeData[], connections: TentacleData[], lastUpdate: number }
 */

import { NODE_TYPE } from '../render/data-model.js';

/** @typedef {import('../render/data-model.js').SceneData} SceneData */
/** @typedef {import('../render/data-model.js').SquidNodeData} SquidNodeData */
/** @typedef {import('../render/data-model.js').TentacleData} TentacleData */

// ── Status mapping ──────────────────────────────────────────────────────────

const GSD_STATUS_MAP = {
  active: 'active',
  complete: 'complete',
  pending: 'pending',
};

function mapMsStatus(status) {
  return GSD_STATUS_MAP[status] || 'pending';
}

function mapSliceStatus(done, active) {
  if (active) return 'active';
  if (done) return 'complete';
  return 'pending';
}

function mapTaskStatus(done, active) {
  if (active) return 'active';
  if (done) return 'complete';
  return 'pending';
}

// ── Main adapter ─────────────────────────────────────────────────────────────

/**
 * Parse a GSD visualizer snapshot into SceneData for the rendering engine.
 * Handles corrupt/incomplete data gracefully — never throws.
 * @param {Object} snapshot - The versioned snapshot object from loadVisualizerData()
 * @returns {SceneData}
 */
export function parseSnapshot(snapshot) {
  try {
    if (!snapshot || typeof snapshot !== 'object') {
      console.warn('[snapshot-adapter] Invalid snapshot: not an object');
      return { nodes: [], connections: [], lastUpdate: Date.now() };
    }

    const nodes = [];
    const connections = [];
    const timestamps = [];
    const nodeIds = new Set();

    // ── Build model map from units ledger ───────────────────────────────
    // units array has {id: "M001/S01/T01", model: "claude-opus-4-0"}
    const modelMap = new Map();
    for (const unit of (snapshot.units || [])) {
      if (unit && unit.id && unit.model) {
        // Last entry wins — source order is not guaranteed to be sorted
        modelMap.set(unit.id, unit.model);
      }
    }

    // ── 1. Process milestones ───────────────────────────────────────────
    for (const ms of (snapshot.milestones || [])) {
      try {
        if (!ms || typeof ms !== 'object') continue;
        const msId = `ms-${ms.id}`;
        if (!msId || nodeIds.has(msId)) continue;
        nodeIds.add(msId);

        const slicesArr = Array.isArray(ms.slices) ? ms.slices : [];
        const slicesDone = slicesArr.filter(s => s && s.done).length;
        const slicesTotal = slicesArr.length;
        const msStatus = mapMsStatus(ms.status);

        /** @type {SquidNodeData} */
        const msNode = {
          id: msId,
          name: `${ms.id || '?'}: ${ms.title || 'Untitled'}`,
          type: NODE_TYPE.MILESTONE,
          status: msStatus,
          slicesDone,
          slicesTotal,
          currentAction: ms.status === 'active' ? 'In progress' : ms.status === 'complete' ? 'Complete' : 'Pending',
          phase: snapshot.phase,
        };
        nodes.push(msNode);

        // ── 2. Process slices within the milestone ─────────────────────
        for (const sl of slicesArr) {
          try {
            if (!sl || typeof sl !== 'object') continue;
            const slId = `sl-${ms.id}-${sl.id}`;
            if (nodeIds.has(slId)) continue;
            nodeIds.add(slId);
            const slStatus = mapSliceStatus(sl.done, sl.active);

            // Sub-nodes: tasks become subagent-style children
            const taskIds = [];
            for (const t of (Array.isArray(sl.tasks) ? sl.tasks : [])) {
              try {
                if (!t || typeof t !== 'object') continue;
                const tId = `tk-${ms.id}-${sl.id}-${t.id}`;
                if (nodeIds.has(tId)) continue;
                nodeIds.add(tId);
                taskIds.push(tId);

                const tStatus = mapTaskStatus(t.done, t.active);

                // Map unit ID (e.g. "M001/S01/T01") → task ID (e.g. "tk-M001-S01-T01")
                const unitId = `${ms.id}/${sl.id}/${t.id}`;
                const unitModel = modelMap.get(unitId);

                /** @type {SquidNodeData} */
                const taskNode = {
                  id: tId,
                  name: `${t.id || '?'}: ${t.title || 'Untitled'}`,
                  type: NODE_TYPE.SUBAGENT,
                  status: tStatus,
                  parentId: slId,
                  estimate: t.estimate,
                  currentAction: t.done ? 'Complete' : t.active ? 'Running' : 'Pending',
                  model: unitModel,
                };
                nodes.push(taskNode);
                connections.push({ from: slId, to: tId, status: tStatus === 'active' ? 'active' : 'idle' });
              } catch (taskErr) {
                console.warn(`[snapshot-adapter] Skipping malformed task:`, taskErr.message);
              }
            }

            // If title equals id, the slice has no proper title — just show the id
            const slDisplayTitle = (sl.title && sl.title !== sl.id) ? sl.title : sl.id;
            const slDisplayName = (sl.title && sl.title !== sl.id) ? `${sl.id}: ${sl.title}` : slDisplayTitle;

            /** @type {SquidNodeData} */
            const slNode = {
              id: slId,
              name: slDisplayName,
              type: NODE_TYPE.SLICE,
              status: slStatus,
              parentId: msId,
              children: taskIds,
              currentAction: sl.done ? 'Complete' : sl.active ? 'Running' : 'Pending',
            };
            nodes.push(slNode);
            connections.push({ from: msId, to: slId, status: slStatus === 'active' ? 'active' : 'idle' });

            // Dependency connections between slices
            if (Array.isArray(sl.depends)) {
              for (const dep of sl.depends) {
                const depId = `sl-${ms.id}-${dep}`;
                if (nodeIds.has(depId)) {
                  connections.push({ from: depId, to: slId, status: 'idle' });
                }
              }
            }
          } catch (sliceErr) {
            console.warn(`[snapshot-adapter] Skipping malformed slice:`, sliceErr.message);
          }
        }

        // Milestone dependency connections — only emit if the dep node exists
        if (Array.isArray(ms.dependsOn)) {
          for (const depMsId of ms.dependsOn) {
            if (nodeIds.has(`ms-${depMsId}`)) {
              connections.push({ from: `ms-${depMsId}`, to: msId, status: 'idle' });
            }
          }
        }
      } catch (msErr) {
        console.warn(`[snapshot-adapter] Skipping malformed milestone:`, msErr.message);
      }
    }

    if (snapshot.lastUpdate) timestamps.push(snapshot.lastUpdate);
    if (snapshot.ts) timestamps.push(new Date(snapshot.ts).getTime());

    return {
      nodes,
      connections,
      lastUpdate: timestamps.length > 0 ? Math.max(...timestamps) : Date.now(),
      _phase: snapshot.phase || 'idle',
      _version: snapshot.version || 1,
      _remainingSlices: snapshot.remainingSliceCount ?? 0,
    };
  } catch (err) {
    console.error('[snapshot-adapter] Fatal parse error:', err.message);
    return { nodes: [], connections: [], lastUpdate: Date.now() };
  }
}

/**
 * Parse raw snapshot JSON text into SceneData.
 * @param {string} jsonText
 * @returns {SceneData|null}
 */
export function parseSnapshotText(jsonText) {
  try {
    const snapshot = JSON.parse(jsonText);
    if (snapshot.version == null || !snapshot.milestones) {
      console.warn('[snapshot-adapter] Invalid snapshot: missing version or milestones');
      return null;
    }
    return parseSnapshot(snapshot);
  } catch (err) {
    console.warn('[snapshot-adapter] Failed to parse snapshot JSON:', err.message);
    return null;
  }
}
