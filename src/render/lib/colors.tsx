import React, {createContext, useContext, useEffect, useState} from 'react';
import {useDelayRender} from 'remotion';
import type {ColorReq, Model} from '../model';
import {url} from './url';

export const ColorsCtx = createContext<Record<string, string>>({});
export const useColors = () => useContext(ColorsCtx);

const load = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => res(i);
    i.onerror = () => rej(new Error(`cannot load ${src}`));
    i.src = src;
  });

const sample = (img: HTMLImageElement, scale: number, r: ColorReq): string => {
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext('2d', {willReadFrequently: true})!;
  const b = r.box;
  const xs = r.mode === 'inside' ? [b.x + 2, b.x + b.w - 2] : b.x >= 10 ? [b.x - 8] : [b.x + b.w + 8];
  const votes = new Map<string, {n: number; rgb: number[]}>();
  for (const x of xs) {
    for (const t of [0.25, 0.5, 0.75]) {
      const y = b.y + b.h * t;
      ctx.clearRect(0, 0, 1, 1);
      ctx.drawImage(img, Math.round(x * scale), Math.round(y * scale), 1, 1, 0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      const k = `${d[0] >> 3},${d[1] >> 3},${d[2] >> 3}`;
      const v = votes.get(k) ?? {n: 0, rgb: [d[0], d[1], d[2]]};
      v.n++;
      votes.set(k, v);
    }
  }
  const best = [...votes.values()].sort((a, b2) => b2.n - a.n)[0];
  return `rgb(${best.rgb.join(',')})`;
};

/** Reads page background colours out of the captured images (once, before the first frame). Children render after that. */
export const ColorsProvider: React.FC<{model: Model; children: React.ReactNode}> = ({model, children}) => {
  const {delayRender, continueRender} = useDelayRender();
  const [handle] = useState(() => delayRender('page colours'));
  const [map, setMap] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    (async () => {
      const out: Record<string, string> = {};
      const imgs = new Map<string, Promise<HTMLImageElement | null>>();
      for (const r of model.colorReqs) {
        const info = model.manifest.sets[r.ref.set]?.screens[r.ref.name];
        if (!info) continue;
        const src = url(model.imageUrl(info.fullFile || info.file));
        if (!imgs.has(src)) imgs.set(src, load(src).catch(() => null));
        const img = await imgs.get(src)!;
        if (img) out[r.id] = sample(img, model.manifest.scale, r);
      }
      return out;
    })()
      .then(setMap, () => setMap({}))
      .finally(() => continueRender(handle));
  }, [model, continueRender, handle]);
  if (!map) return null;
  return <ColorsCtx.Provider value={map}>{children}</ColorsCtx.Provider>;
};
