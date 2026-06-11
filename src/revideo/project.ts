// Revideo 项目入口 — makeProject
// 注册所有视频场景模板

import { makeProject } from '@revideo/core';

import titleIntro from './scenes/title-intro';

export default makeProject({
  name: '灵集 Revideo 视频模板',
  scenes: [titleIntro],
  variables: {
    title: '标题',
    subtitle: '',
    backgroundColor: '#0A1629',
    accentColor: '#3B82F6',
  },
  settings: {
    shared: {
      size: { x: 1920, y: 1080 },
      range: [0, 150], // 5 秒 @ 30fps → frame range
      background: '#0A1629',
    },
    rendering: {
      fps: 30,
      resolutionScale: 1,
      exporter: { name: '@revideo/core/wasm' },
      colorSpace: 'srgb',
    },
    preview: {
      fps: 30,
      resolutionScale: 1,
    },
  },
});
