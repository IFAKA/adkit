export type Box = {x: number; y: number; w: number; h: number};
export type ScreenEntry = {file: string; fullFile: string; fullHeight: number; scrollY: number; sha: string; elements: Record<string, Box>; /** Recorded frame sequence (files in capture order, one per video frame; a still held for several frames repeats its file). */ frames?: string[]};
export type SetEntry = {theme: {bg: string; fg: string; accent: string}; screens: Record<string, ScreenEntry>};
export type Manifest = {scale: number; viewport: {w: number; h: number}; /** Phone safe-area insets the pages were shot with (the capture then includes the status-bar and home-indicator areas). */ safeArea?: {top: number; bottom: number}; sets: Record<string, SetEntry>};

/** Puts the screens of `patch` over `base` (used when only one set or screen is re-shot). Neither input is changed. */
export function mergeManifest(base: Manifest | undefined, patch: Manifest): Manifest {
  if (!base) return structuredClone(patch);
  const out: Manifest = {scale: patch.scale, viewport: patch.viewport, safeArea: patch.safeArea, sets: structuredClone(base.sets)};
  for (const [name, set] of Object.entries(patch.sets)) {
    const cur = out.sets[name];
    out.sets[name] = {theme: set.theme, screens: {...(cur?.screens ?? {}), ...structuredClone(set.screens)}};
  }
  return out;
}
