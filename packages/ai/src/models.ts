// Model router (docs/copilot-architecture.md). One place to change model IDs;
// swappable without touching call sites. Project deliberately uses Haiku for
// cheap auto-tag classification and Sonnet for the tool-using copilot/debrief.

export const MODELS = {
  /** auto-tagging on import — cheap classification */
  autoTag: "claude-haiku-4-5",
  /** copilot chat — tool use over packages/analytics */
  copilot: "claude-sonnet-5",
  /** daily debrief — Batch API, prompt-cached */
  debrief: "claude-sonnet-5",
} as const;

export type ModelRole = keyof typeof MODELS;
