import type { ToolDefinition } from '../../types';
import { getApiBaseUrl } from '../api-base-url';

export const publishContentTool: ToolDefinition = {
  name: 'publish_content',
  description: '将内容发布到社交媒体平台。支持微信公众号、微博等平台的一键发布。需要用户已授权对应平台账号。',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '发布内容标题' },
      content: { type: 'string', description: '发布正文内容' },
      platforms: { type: 'string', description: '目标平台，用逗号分隔: wechat_mp(公众号), weibo(微博), douyin(抖音), xiaohongshu(小红书), bilibili(B站)。默认需要用户确认' },
      coverUrl: { type: 'string', description: '封面图URL（可选）' },
      tags: { type: 'string', description: '标签，用逗号分隔（可选）' },
      scheduledAt: { type: 'string', description: '定时发布时间，ISO 8601格式（可选，不填则立即发布）' },
    },
    required: ['title', 'content', 'platforms'],
  },
  async handler(params, _ctx) {
    const title = params.title as string;
    const content = params.content as string;
    const platformsStr = params.platforms as string;
    const coverUrl = params.coverUrl as string | undefined;
    const tags = params.tags as string | undefined;
    const scheduledAt = params.scheduledAt as string | undefined;

    const platforms = platformsStr.split(/[,，]/).map(p => p.trim()).filter(Boolean);
    const validPlatforms = ['wechat_mp', 'weibo', 'douyin', 'xiaohongshu', 'wechat_video', 'bilibili'];
    const invalidPlatforms = platforms.filter(p => !validPlatforms.includes(p));

    if (invalidPlatforms.length > 0) {
      return {
        success: false,
        output: `不支持的平台: ${invalidPlatforms.join(', ')}。支持的平台: ${validPlatforms.join(', ')}`,
      };
    }

    const platformNames: Record<string, string> = {
      wechat_mp: '微信公众号', weibo: '微博', douyin: '抖音',
      xiaohongshu: '小红书', wechat_video: '视频号', bilibili: 'B站',
    };

    try {
      const tagArr = tags ? tags.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];
      const baseUrl = getApiBaseUrl();

      // 检查已授权的自动发布平台
      const accRes = await fetch(`${baseUrl}/api/platforms/accounts`);
      const accData = await accRes.json();
      const connectedAccounts = accData.success ? (accData.data?.accounts || []) : [];
      const connectedPlatforms = new Set(connectedAccounts.map((a: any) => a.platform));

      const results: string[] = [];

      for (const platform of platforms) {
        const name = platformNames[platform] || platform;

        if (connectedPlatforms.has(platform)) {
          // 自动发布
          const account = connectedAccounts.find((a: any) => a.platform === platform && a.status === 'active');
          if (!account) {
            results.push(`❌ ${name}: 账号未连接或已过期，请先授权`);
            continue;
          }

          const res = await fetch(`${baseUrl}/api/platforms/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              platform, accountId: account.id, title: title.trim(),
              content: content.trim(), coverUrl: coverUrl || undefined,
              tags: tagArr, scheduledPublishAt: scheduledAt || undefined,
            }),
          });
          const data = await res.json();
          results.push(data.success
            ? `✅ ${name}: 已${scheduledAt ? '定时' : '发布'}`
            : `❌ ${name}: ${data.error || '发布失败'}`);
        } else {
          // 手动发布 — 创建草稿
          const res = await fetch(`${baseUrl}/api/platforms/publish-manual`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              platform, title: title.trim(), content: content.trim(),
              coverUrl: coverUrl || undefined, tags: tagArr,
              scheduledPublishAt: scheduledAt || undefined,
            }),
          });
          const data = await res.json();
          results.push(data.success
            ? `📝 ${name}: 草稿已创建（需手动发布）`
            : `❌ ${name}: ${data.error || '创建失败'}`);
        }
      }

      return {
        success: true,
        output: `发布结果：\n${results.join('\n')}`,
        data: { results },
      };
    } catch (e) {
      return {
        success: false,
        output: '',
        error: `发布失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  },
};
