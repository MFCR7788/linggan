// 技能 API — Skills Hub
// GET  /api/assistant/skills?action=list|view|search|installed|hub
// POST /api/assistant/skills — install / uninstall / invoke / create / match

import { withAuth } from '@/lib/api-handler';
import { createApiResponse, createApiError } from '@/lib/api-utils';
import { SkillsHub } from '@/lib/assistant/skills/hub';

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
          visibility: 'private',
        });
        if (!skill) return createApiError('创建失败', 500);
        return createApiResponse(skill);
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
