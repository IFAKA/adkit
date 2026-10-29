import React from 'react';
import {Composition} from 'remotion';
import {Ad} from './Ad';
import type {RenderProps} from './types';

const empty = {plan: {fps: 30, width: 1080, height: 1920, total: 30, blocks: [], titles: [], cues: [], beat: 15, bar: 60}} as unknown as RenderProps;

export const Root: React.FC = () => (
  <Composition
    id="Ad"
    component={Ad as unknown as React.FC<Record<string, unknown>>}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={30}
    defaultProps={empty as unknown as Record<string, unknown>}
    calculateMetadata={({props}) => {
      const p = (props as unknown as RenderProps).plan;
      return {durationInFrames: Math.max(1, p.total), fps: p.fps, width: p.width, height: p.height};
    }}
  />
);
