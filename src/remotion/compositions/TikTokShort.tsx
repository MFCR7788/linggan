// TikTokShort — 短视频模板 (9:16 竖屏)
// 支持多段素材拼接 + 标题 + 字幕 + 背景音乐

import { useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Audio, AbsoluteFill } from 'remotion';

export interface TikTokShortProps {
  /** 标题文字（显示在顶部） */
  title: string;
  /** 副标题/描述 */
  subtitle: string;
  /** 视频片段列表 [{ url, startFrame?, durationFrames? }] */
  clips: Array<{ url: string; startFrame?: number; durationFrames?: number }>;
  /** 背景音乐 URL（可选） */
  bgmUrl?: string;
  /** 背景音乐音量 0-1（默认 0.3） */
  bgmVolume?: number;
  /** 主色（默认 #8B5CF6 紫色） */
  accentColor?: string;
}

export const tiktokShortSchema = {
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 900, // 默认 30 秒
  defaultProps: {
    title: '标题',
    subtitle: '副标题',
    clips: [],
    bgmVolume: 0.3,
    accentColor: '#8B5CF6',
  } as TikTokShortProps,
};

export const TikTokShort: React.FC<{ title: string; subtitle: string; clips: Array<{ url: string; startFrame?: number; durationFrames?: number }>; bgmUrl?: string; bgmVolume?: number; accentColor?: string }> = ({
  title,
  subtitle,
  clips,
  bgmUrl,
  bgmVolume = 0.3,
  accentColor = '#8B5CF6',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // 标题入场动画
  const titleOpacity = spring({ frame, fps, config: { damping: 12 } });
  const titleSlide = interpolate(titleOpacity, [0, 1], [-30, 0]);

  // 计算片段边界
  const safeClips = clips.length > 0 ? clips : [{ url: 'placeholder', durationFrames: durationInFrames }];
  const clipBoundaries: Array<{ start: number; end: number; url: string }> = [];
  let cursor = 60; // 预留标题区域

  for (const clip of safeClips) {
    const dur = clip.durationFrames || 150;
    clipBoundaries.push({ start: cursor, end: cursor + dur, url: clip.url });
    cursor += dur;
  }

  // 找到当前帧对应的片段
  const activeClip = clipBoundaries.find(b => frame >= b.start && frame < b.end);

  return (
    <AbsoluteFill style={{ backgroundColor: '#0A0A0A' }}>
      {/* BGM */}
      {bgmUrl && <Audio src={bgmUrl} volume={bgmVolume} />}

      {/* 视频片段 */}
      {activeClip ? (
        <Sequence from={activeClip.start} durationInFrames={activeClip.end - activeClip.start}>
          <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
            {/* 简易视频占位 — 实际用 <OffthreadVideo> */}
            <div
              style={{
                width: '100%',
                height: '100%',
                background: `linear-gradient(135deg, ${accentColor}20, ${accentColor}40)`,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 80, opacity: 0.5 }}>🎬</span>
            </div>
          </AbsoluteFill>
        </Sequence>
      ) : (
        // 末尾：显示总结
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', background: `linear-gradient(135deg, ${accentColor}30, #0A0A0A)` }}>
          <span style={{ fontSize: 100 }}>✨</span>
        </AbsoluteFill>
      )}

      {/* 顶部标题 */}
      <div
        style={{
          position: 'absolute',
          top: 80,
          left: 60,
          right: 60,
          opacity: titleOpacity,
          transform: `translateY(${titleSlide}px)`,
        }}
      >
        <h1 style={{
          fontSize: 72,
          fontWeight: 800,
          color: '#FFFFFF',
          textShadow: '0 4px 20px rgba(0,0,0,0.6)',
          lineHeight: 1.2,
          margin: 0,
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{
            fontSize: 40,
            color: `${accentColor}CC`,
            marginTop: 16,
            fontWeight: 500,
          }}>
            {subtitle}
          </p>
        )}
      </div>

      {/* 底部水印 */}
      <div style={{ position: 'absolute', bottom: 60, left: 0, right: 0, textAlign: 'center' }}>
        <span style={{ fontSize: 28, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
          灵集 AI · 自动生成
        </span>
      </div>
    </AbsoluteFill>
  );
};
