import {staticFile} from 'remotion';
/** Model image paths are either full URLs or "@static:<path>" (a file in the bundler's public dir). */
export const url = (p: string) => (p.startsWith('@static:') ? staticFile(p.slice(8)) : p);
