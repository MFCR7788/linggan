// Remotion 视频模板注册入口
// 每个 Composition 是一个可渲染的视频类型
// Agent 通过 generate_video_template 工具选择模板 + 生成 props

import { Composition } from 'remotion';
import { TikTokShort, tiktokShortSchema } from './compositions/TikTokShort';
import { TitleIntro, titleIntroSchema } from './compositions/TitleIntro';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TikTokShort"
        component={TikTokShort as any}
        durationInFrames={tiktokShortSchema.durationInFrames}
        fps={tiktokShortSchema.fps}
        width={tiktokShortSchema.width}
        height={tiktokShortSchema.height}
        defaultProps={tiktokShortSchema.defaultProps}
      />

      <Composition
        id="TitleIntro"
        component={TitleIntro as any}
        durationInFrames={titleIntroSchema.durationInFrames}
        fps={titleIntroSchema.fps}
        width={titleIntroSchema.width}
        height={titleIntroSchema.height}
        defaultProps={titleIntroSchema.defaultProps}
      />
    </>
  );
};
