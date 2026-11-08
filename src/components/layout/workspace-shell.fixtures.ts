import type { WorkspaceShellProps } from "./workspace-shell";

export const ready = {
  title: "Fictional workspace",
  description: "Synthetic props for isolated view development.",
  period: "Q3 2026",
  asOf: "2026-09-30",
  loading: false,
  error: "",
  onRetry: () => {},
  mode: "demo",
  liveAvailable: false,
  onModeChange: () => {},
  onReset: () => {},
  resetting: false,
} satisfies WorkspaceShellProps;
export const loading = { ...ready, loading: true } satisfies WorkspaceShellProps;
export const unavailable = { ...ready, error: "The fictional server is unavailable." } satisfies WorkspaceShellProps;
export const live = { ...ready, mode: "live", liveAvailable: true } satisfies WorkspaceShellProps;
export const resetting = { ...ready, resetting: true } satisfies WorkspaceShellProps;
