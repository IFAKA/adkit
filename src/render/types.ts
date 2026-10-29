import type {Plan} from '../engine/plan';
import type {Ad} from '../spec/schema';
import type {Manifest} from '../capture/manifest';

export type CaptureManifest = Manifest;
export type RenderProps = {
  plan: Plan;
  spec: Ad;
  manifest: CaptureManifest;
  /** Where the capture files and the optional backdrop photo live: a URL (http...) or a folder inside the bundler's public dir ('' = its root). */
  assetBase: string;
  /** Optional backdrop photo, relative to assetBase (not in the spec schema yet). */
  photo?: string;
};
