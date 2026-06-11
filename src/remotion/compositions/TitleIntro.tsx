// TitleIntro — 标题开场动画模板 (16:9 横屏)
// 用于 B站/YouTube 视频片头，也支持 1:1 方形

import { useCurrentFrame, useVideoConfig, interpolate, spring, AbsoluteFill } from 'remotion';

export interface TitleIntroProps {
  /** 主标题 */
  title: string;
  /** 副标题 */
  subtitle?: string;
  /** 背景色（默认深色渐变） */
  backgroundColor?: string;
  /** 强调色（默认 #3B82F6） */
  accentColor?: string;
  /** 是否显示装饰粒子动画 */
  showParticles?: boolean;
  /** 视频宽高比: '16:9' | '1:1' | '9:16' */
  aspectRatio?: '16:9' | '1:1' | '9:16';
}

export const titleIntroSchema = {
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 150, // 5 秒
  defaultProps: {
    title: '标题',
    subtitle: '',
    backgroundColor: '#0A1629',
    accentColor: '#3B82F6',
    showParticles: true,
    aspectRatio: '16:9' as const,
  } as TitleIntroProps,
};

const PARTICLE_COUNT = 20;

export const TitleIntro: React.FC<TitleIntroProps> = ({
  title,
  subtitle,
  backgroundColor = '#0A1629',
  accentColor = '#3B82F6',
  showParticles = true,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // 标题入场：spring 弹入 + 淡入
  const titleProgress = spring({ frame, fps, config: { damping: 10, stiffness: 80 } });
  const titleScale = interpolate(titleProgress, [0, 1], [0.6, 1]);
  const titleOpacity = interpolate(titleProgress, [0, 0.3], [0, 1]);

  // 副标题延迟淡入
  const subtitleStart = 20;
  const subtitleOpacity = interpolate(
    frame - subtitleStart,
    [0, 15],
    [0, 1],
    { extrapolateRight: 'clamp' }
  );

  // 装饰线展开
  const lineWidth = spring({ frame: frame - 10, fps, config: { damping: 15 } });
  const lineWidthPx = interpolate(lineWidth, [0, 1], [0, 300]);

  // 背景光晕呼吸
  const glowOpacity = interpolate(
    Math.sin(frame * 0.05),
    [-1, 1],
    [0.15, 0.35]
  );

  // 粒子
  const particles = showParticles
    ? Array.from({ length: PARTICLE_COUNT }, (_, i) => {
        const seed = i * 137.5;
        const x = ((seed * 7) % width);
        const y = ((seed * 13) % height);
        const drift = Math.sin(frame * 0.02 + i) * 20;
        const particleOpacity = interpolate(
          frame % 120,
          [i * 3, i * 3 + 30, i * 3 + 60, i * 3 + 120],
          [0, 0.6, 0.6, 0],
          { extrapolateRight: 'clamp' }
        );
        return { x: x + drift, y, size: 2 + (i % 4), opacity: particleOpacity };
      })
    : [];

  return (
    <AbsoluteFill style={{ backgroundColor, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* 背景光晕 */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 600,
          height: 600,
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${accentColor}40 0%, transparent 70%)`,
          opacity: glowOpacity,
        }}
      />

      {/* 粒子 */}
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: accentColor,
            opacity: p.opacity,
          }}
        />
      ))}

      {/* 中心内容 */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: 80,
        }}
      >
        {/* 装饰线 */}
        <div
          style={{
            width: lineWidthPx,
            height: 3,
            background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
            marginBottom: 40,
            borderRadius: 2,
          }}
        />

        {/* 主标题 */}
        <h1
          style={{
            fontSize: 96,
            fontWeight: 800,
            color: '#FFFFFF',
            textAlign: 'center',
            lineHeight: 1.2,
            margin: 0,
            textShadow: `0 2px 30px ${accentColor}60`,
            transform: `scale(${titleScale})`,
            opacity: titleOpacity,
          }}
        >
          {title}
        </h1>

        {/* 副标题 */}
        {subtitle && (
          <p
            style={{
              fontSize: 42,
              color: `${accentColor}CC`,
              marginTop: 24,
              fontWeight: 500,
              textAlign: 'center',
              opacity: subtitleOpacity,
            }}
          >
            {subtitle}
          </p>
        )}

        {/* 底部装饰线 */}
        <div
          style={{
            width: lineWidthPx * 0.6,
            height: 2,
            background: `linear-gradient(90deg, transparent, ${accentColor}80, transparent)`,
            marginTop: 40,
            borderRadius: 2,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
