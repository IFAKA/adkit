import React, {useEffect, useState} from 'react';
import {useDelayRender} from 'remotion';
import {url} from './url';

/** <img> that blocks the render until loaded and does not crash when the file is missing. */
export const SafeImg: React.FC<{src: string; style?: React.CSSProperties; onFail?: () => void}> = ({src, style, onFail}) => {
  const {delayRender, continueRender} = useDelayRender();
  const [handle] = useState(() => delayRender(`img ${src}`));
  const [ok, setOk] = useState(true);
  useEffect(() => () => continueRender(handle), [continueRender, handle]);
  if (!ok) return null;
  return (
    <img
      src={url(src)}
      alt=""
      draggable={false}
      style={{display: 'block', ...style}}
      onLoad={() => continueRender(handle)}
      onError={() => {
        setOk(false);
        continueRender(handle);
        onFail?.();
      }}
    />
  );
};
