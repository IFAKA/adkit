export type Box = {x: number; y: number; w: number; h: number};
export type ScreenEntry = {file: string; fullFile: string; fullHeight: number; scrollY: number; sha: string; elements: Record<string, Box>};
export type SetEntry = {theme: {bg: string; fg: string; accent: string}; screens: Record<string, ScreenEntry>};
export type Manifest = {scale: number; viewport: {w: number; h: number}; sets: Record<string, SetEntry>};

/** Puts the screens of `patch` over `base` (used when only one set or screen is re-shot). Neither input is changed. */
export function mergeManifest(base: Manifest | undefined, patch: Manifest): Manifest {
  if (!base) return structuredClone(patch);
  const out: Manifest = {scale: patch.scale, viewport: patch.viewport, sets: structuredClone(base.sets)};
  for (const [name, set] of Object.entries(patch.sets)) {
    const cur = out.sets[name];
    out.sets[name] = {theme: set.theme, screens: {...(cur?.screens ?? {}), ...structuredClone(set.screens)}};
  }
  return out;
}
