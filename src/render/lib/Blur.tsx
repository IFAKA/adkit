import React, {createContext, useContext} from 'react';
import {CameraMotionBlur} from '@remotion/motion-blur';

/** True while drawing a draft (no motion blur: much faster, only for the review loop). */
export const DraftCtx = createContext(false);

export const MotionBlur: React.FC<{shutterAngle: number; samples: number; children: React.ReactNode}> = ({shutterAngle, samples, children}) => {
  const draft = useContext(DraftCtx);
  if (draft) return <>{children}</>;
  return <CameraMotionBlur shutterAngle={shutterAngle} samples={samples}>{children}</CameraMotionBlur>;
};
