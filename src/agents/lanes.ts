import { CommandLane } from "../process/lanes.js";

// Keep exported lane identifiers as plain strings so callers can compare them
// against arbitrary lane labels (per-session suffixes, user-supplied lanes)
// without tripping no-unsafe-enum-comparison.
export const AGENT_LANE_NESTED: string = CommandLane.Nested;
export const AGENT_LANE_SUBAGENT: string = CommandLane.Subagent;
const NESTED_LANE_SESSION_SEPARATOR = ":";

export function resolveNestedAgentLane(lane?: string): string {
  const trimmed = lane?.trim();
  // Nested agent runs should not inherit the cron execution lane. Cron jobs
  // already occupy that lane while they dispatch inner work.
  if (!trimmed || trimmed === "cron") {
    return AGENT_LANE_NESTED;
  }
  return trimmed;
}

/**
 * Build a nested-agent lane key scoped to the target session key so that a
 * long-running nested operation against session A does not block nested
 * operations against session B. Fall back to the unscoped nested lane when
 * no session key is available so existing cron/legacy callers keep their
 * current semantics.
 *
 * Prior behaviour routed every nested run (sessions_send A2A flows, agent
 * step follow-ups, ACP Claude Code runs) through a single global `nested`
 * queue with `maxConcurrent=1`. A single long ACP run on one session could
 * starve every other agent's nested work across the gateway (#67502).
 *
 * Lane lifecycle: per-session lanes follow the same pattern as the existing
 * `session:<key>` lanes (see `src/agents/pi-embedded-runner/lanes.ts`). Lane
 * state in `src/process/command-queue.ts` persists for the gateway process
 * lifetime in its `Map<string, LaneState>` and is never actively reaped, so
 * each distinct session key minted here contributes one long-lived entry
 * (~200 bytes). This matches existing per-session lane behaviour and has
 * not been a problem in practice; an idle-lane reaper would be a clean
 * follow-up but is intentionally out of scope here.
 */
export function resolveNestedAgentLaneForSession(sessionKey: string | undefined): string {
  const trimmed = sessionKey?.trim();
  if (!trimmed) {
    return AGENT_LANE_NESTED;
  }
  return `${AGENT_LANE_NESTED}${NESTED_LANE_SESSION_SEPARATOR}${trimmed}`;
}

/**
 * Return true when `lane` is the unscoped nested lane or a per-session
 * nested lane produced by `resolveNestedAgentLaneForSession`. Callers that
 * switch on lane identity (delivery logging, metrics) should treat both
 * forms the same way.
 */
export function isNestedAgentLane(lane: string | undefined): boolean {
  if (!lane) {
    return false;
  }
  return (
    lane === AGENT_LANE_NESTED ||
    lane.startsWith(`${AGENT_LANE_NESTED}${NESTED_LANE_SESSION_SEPARATOR}`)
  );
}
