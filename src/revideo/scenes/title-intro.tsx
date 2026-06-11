// Revideo TitleIntro — 标题开场动画 (等效于 Remotion TitleIntro)
// 使用 generator function + JSX，MIT 许可

import { makeScene2D, Rect, Txt, Circle, Layout } from '@revideo/2d';
import { all, delay, waitFor } from '@revideo/core';
import { SmoothSpring, spring } from '@revideo/core';
import { useScene2D } from '@revideo/2d';

export default makeScene2D('TitleIntro', function* (view) {
  const scene = useScene2D();
  const titleText = scene.variables.get('title', '标题')();
  const subtitleText = scene.variables.get('subtitle', '')();
  const bgColor = scene.variables.get('backgroundColor', '#0A1629')();
  const accentColor = scene.variables.get('accentColor', '#3B82F6')();

  // 背景
  view.add(<Rect width={1920} height={1080} fill={bgColor} />);

  // 背景光晕
  const glow = <Circle
    width={600}
    height={600}
    fill={accentColor}
    opacity={0.12}
  />;
  view.add(glow);

  // 中心内容容器
  const container = (
    <Layout
      layout
      direction={'column'}
      alignItems={'center'}
      justifyContent={'center'}
      width={1920}
      height={1080}
      gap={24}
    />
  );
  view.add(container);

  // 顶部装饰线
  const topLine = <Rect
    width={0}
    height={3}
    fill={accentColor}
    radius={2}
  />;
  container.add(topLine);

  // 主标题
  const title = <Txt
    text={titleText}
    fontSize={96}
    fontWeight={800}
    fill={'#FFFFFF'}
    scale={0.6}
    opacity={0}
  />;
  container.add(title);

  // 副标题（如果有）
  let subtitle: ReturnType<typeof Txt.b> | null = null;
  if (subtitleText) {
    subtitle = <Txt
      text={subtitleText}
      fontSize={42}
      fontWeight={500}
      fill={accentColor}
      opacity={0}
    />;
    container.add(subtitle);
  }

  // 底部装饰线
  const bottomLine = <Rect
    width={0}
    height={2}
    fill={accentColor}
    opacity={0.5}
    radius={2}
  />;
  container.add(bottomLine);

  // === 动画 ===

  // 1. 光晕呼吸
  yield* glow.opacity(0.15, 0.5);
  const glowBreathe = function* () {
    while (true) {
      yield* glow.opacity(0.25, 1.5);
      yield* glow.opacity(0.12, 1.5);
    }
  };

  // 2. 标题 spring 弹入
  yield* all(
    spring(SmoothSpring, 0.6, 1, (v) => title.scale([v, v])),
    title.opacity(1, 0.3),
  );

  // 3. 顶部装饰线展开
  yield* topLine.width(300, 0.8);

  // 4. 副标题延迟淡入
  if (subtitle) {
    yield* subtitle.opacity(1, 0.5);
  }

  // 5. 底部装饰线展开
  yield* bottomLine.width(180, 0.6);

  // 6. 保持 + 光晕呼吸
  yield* waitFor(2);
});
