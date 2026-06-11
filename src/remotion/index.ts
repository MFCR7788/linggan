// Remotion 视频模板打包入口
// @remotion/bundler 使用此文件注册所有可渲染的 Composition
// 通过 renderMedia 按 Composition ID + inputProps 渲染

import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

registerRoot(RemotionRoot);
