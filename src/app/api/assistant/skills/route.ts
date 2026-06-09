// 技能 API — Skills Hub
// GET  /api/assistant/skills?action=list|view|search|installed|hub
// POST /api/assistant/skills — install / uninstall / invoke / create / match

import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { SkillsHub } from '@/lib/assistant/skills/hub';
import { callDeepSeek } from '@/lib/ai-services';

async function getHub(userId: string): Promise<SkillsHub> {
  const hub = new SkillsHub({ userId });
  await hub.initialize();
  return hub;
}

export const GET = withAuth(async ({ request, user }) => {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'list';
  const skillId = searchParams.get('skillId');
  const query = searchParams.get('query');
  const category = searchParams.get('category');

  try {
    const hub = await getHub(user.id);

    switch (action) {
      case 'view': {
        if (!skillId) return createApiError('缺少 skillId', 400);
        const skill = await hub.viewSkill(skillId);
        if (!skill) return createApiError('技能不存在', 404);
        return createApiResponse(skill);
      }

      case 'files': {
        if (!skillId) return createApiError('缺少 skillId', 400);
        const files = await hub.getSkillFiles(skillId);
        return createApiResponse({ skillId, files });
      }

      case 'search': {
        if (!query) return createApiError('缺少 query', 400);
        const results = await hub.listSkills({ search: query });
        return createApiResponse(results);
      }

      case 'installed': {
        const installed = hub.registry
          .getAll()
          .filter(s => hub.installedSkillIds.includes(s.id))
          .map(s => ({ ...s, promptTemplate: '' }));
        return createApiResponse(installed);
      }

      case 'hub': {
        const categories = hub.getHubCategories();
        return createApiResponse(categories);
      }

      default: {
        const skills = category
          ? await hub.listSkills({ category })
          : await hub.listSkills();
        return createApiResponse(skills);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return createApiError(msg, 500);
  }
});

export const POST = withAuth(async ({ request, user }) => {
  try {
    const body = await request.json();
    const { action, skillId, query, params, userQuery } = body;

    if (!action) return createApiError('缺少 action', 400);

    const hub = await getHub(user.id);

    switch (action) {
      case 'install': {
        if (!skillId) return createApiError('缺少 skillId', 400);
        const ok = await hub.install(skillId);
        return createApiResponse({ installed: ok });
      }

      case 'uninstall': {
        if (!skillId) return createApiError('缺少 skillId', 400);
        const ok = await hub.uninstall(skillId);
        return createApiResponse({ uninstalled: ok });
      }

      case 'invoke': {
        if (!skillId) return createApiError('缺少 skillId', 400);
        const result = await hub.invoke(skillId, params || {}, userQuery);
        return createApiResponse(result);
      }

      case 'create': {
        const { name, displayName, description, promptTemplate, tags, category, version = '1.0.0' } = body;
        if (!name || !displayName || !promptTemplate) {
          return createApiError('name, displayName, promptTemplate 必填', 400);
        }
        const skill = await hub.registry.create({
          name,
          displayName,
          description: description || '',
          tags: tags || [],
          category,
          promptTemplate,
          version,
          authorId: user.id,
          visibility: body.visibility === 'public' ? 'public' : 'private',
        });
        if (!skill) return createApiError('创建失败', 500);
        return createApiResponse(skill);
      }

      case 'generate': {
        const { description: userDesc } = body;
        if (!userDesc) return createApiError('缺少 description', 400);

        const prompt = `你是一位专业的技能设计师，参考 Anthropic skill-creator 的最佳实践来创建技能。

## 用户想要创建的技能
${userDesc}

## 输出要求
只输出一个 JSON 对象（不要 markdown 代码块），包含：

{
  "name": "kebab-case 英文标识，简短有描述性，例: weibo-copywriter, seo-title-gen",
  "displayName": "中文显示名，10 字以内",
  "description": "【最重要的字段】这是技能的触发描述。必须包含：(1) 技能做什么 (2) 什么情况下应该使用它。描述要'主动'（pushy），避免只写功能不写触发场景。例: '当用户需要写微博文案、社交媒体短文案、或者提到微博推广/涨粉/互动率时使用此技能。提供微博专属的文案创作和优化。' 而非 '微博文案创作工具'。控制在 60-100 字。",
  "category": "writing / social / image / video / analysis / productivity 之一",
  "tags": ["3-5个中文标签"],
  "promptTemplate": "完整的系统提示词，注入到 AI 的 system prompt 中。用中文写，控制在 500-1500 字。"
}

## promptTemplate 写作规范（遵循 skill-creator 模式）

### 1. 角色设定（1-2 句）
明确告诉 AI 它是谁： "你是一位精通 XX 的专家..."

### 2. 核心原则（2-3 条）
用祈使句（imperative form）解释 WHY，而非只用 MUST：
- 好："当用户提到XX时，优先给出可操作的步骤而非理论解释，因为创作者需要的是能直接用的内容"
- 差："必须始终给出步骤"

### 3. 输出结构（模板化）
## 输出结构
ALWAYS 使用以下结构：
### 1. [板块名称]
- 具体内容和格式要求
### 2. [板块名称]
- ...

如果适用，给出 Input/Output 示例：
**示例：**
输入：用户说"帮我写一篇XX推广文案"
输出：
[展示期望的输出格式]

### 4. 风格指南
具体的风格要求，用祈使句，解释为什么重要。

### 5. 边界和约束
什么该做，什么该避免。

### 写作要点
- 用祈使句写指令（"请分析..."而非"你应该分析..."）
- 解释 WHY 而非只堆砌 MUST/DON'T
- 避免全大写（ALWAYS/NEVER）除非极其关键
- 保持精简：如果一段话删掉后不影响效果，就删掉
- 输出模板要具体，让 AI 有明确的产出目标
- 如果是中文创作者场景，注意适配中国社交媒体平台的特性

确保 JSON 有效，promptTemplate 中的引号需转义。只输出 JSON。`;

        try {
          const raw = await callDeepSeek(prompt, { temperature: 0.7, maxTokens: 2500 });
          // 去掉可能的 markdown 代码块包装
          let json = raw.trim();
          if (json.startsWith('```')) {
            json = json.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
          }
          const skill = JSON.parse(json);
          return createApiResponse(skill);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return createApiError(`AI 生成失败: ${msg}`, 500);
        }
      }

      case 'match': {
        if (!query) return createApiError('缺少 query 参数', 400);
        const matches = hub.matchSkills(query as string, 5);
        return createApiResponse(matches);
      }

      default:
        return createApiError(`未知 action: ${action}`, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return createApiError(msg, 500);
  }
});
