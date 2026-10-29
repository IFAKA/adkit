import React from 'react';
import {W} from '../model';
import type {Cam} from '../choreo';
import {stagePt} from '../choreo';

/** Virtual camera: the stage point under focus (a phone-screen coordinate) is placed at (W/2, qy), then zoomed and rotated. */
export const Camera: React.FC<{cam: Cam; children: React.ReactNode}> = ({cam, children}) => {
  const p = stagePt(cam.fx, cam.fy);
  return (
    <div style={{position: 'absolute', inset: 0, overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: 0, top: 0, width: W, height: 1920, transformOrigin: '0 0', transform: `translate(${W / 2}px, ${cam.qy}px) rotate(${cam.rot}deg) scale(${cam.zoom}) translate(${-p.x}px, ${-p.y}px)`}}>
        <div style={{position: 'absolute', inset: 0, perspective: 2600, perspectiveOrigin: '50% 50%'}}>{children}</div>
      </div>
    </div>
  );
};

/** Parallax offset for the background, from the camera. */
export const parallax = (cam: Cam) => {
  const p = stagePt(cam.fx, cam.fy);
  return {x: -(p.x - 540) * 0.1, y: -(p.y - 1230) * 0.08, scale: 1 + (cam.zoom - 1) * 0.12};
};
