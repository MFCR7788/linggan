'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Download, Trash2, Star, X,
  Puzzle, ChevronRight, ExternalLink, Plus,
} from 'lucide-react';
import { ProtectedRoute } from '@/components';
import { TopNav } from '@/components/TopNav';
import { PageKey } from "@/components/BottomNav";
import { GlassCard } from '@/components/GlassCard';
import { LoadingSpinner } from '@/components/loading-spinner';
import { ErrorState } from '@/components/error-state';
import { EmptyState } from '@/components/empty-state';
import { useToast } from '@/components/Toast';
import { useSkills, useInstallSkill, useUninstallSkill, useSkill, useInstalledSkillIds } from '@/hooks/use-skills';
import { apiClient } from '@/lib/api-client';
import type { SkillDefinition } from '@/lib/assistant/types';

const CATEGORIES = [
  { value: '', label: '全部', icon: '🧩' },
  { value: 'writing', label: '文案创作', icon: '✍️' },
  { value: 'image', label: '图片处理', icon: '🖼️' },
  { value: 'video', label: '视频制作', icon: '🎬' },
  { value: 'analysis', label: '数据分析', icon: '📊' },
  { value: 'social', label: '社交媒体', icon: '📱' },
  { value: 'productivity', label: '效率工具', icon: '⚡' },
];

function SkillsContent() {
  const router = useRouter();
  const { showToast } = useToast();
  const [category, setCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [tab, setTab] = useState<'hub' | 'installed'>('hub');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);

  // 创建技能弹窗
  const [showCreate, setShowCreate] = useState(false);
  const [createMode, setCreateMode] = useState<'ai' | 'manual'>('ai');
  const [aiDescription, setAiDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    displayName: '',
    description: '',
    category: '',
    tags: '',
    promptTemplate: '',
    visibility: 'private' as 'private' | 'public',
  });
  const [creating, setCreating] = useState(false);

  const handleGenerate = async () => {
    if (!aiDescription.trim()) {
      showToast('请描述你想要的技能', 'error');
      return;
    }
    setGenerating(true);
    try {
      const resp = await apiClient.post<{
        name: string; displayName: string; description: string;
        category: string; tags: string[]; promptTemplate: string;
      }>('/assistant/skills', {
        action: 'generate',
        description: aiDescription.trim(),
      });
      if (resp.success && resp.data) {
        const d = resp.data;
        setCreateForm({
          name: d.name || '',
          displayName: d.displayName || '',
          description: d.description || '',
          category: d.category || '',
          tags: Array.isArray(d.tags) ? d.tags.join(', ') : '',
          promptTemplate: d.promptTemplate || '',
          visibility: 'private',
        });
        setCreateMode('manual');
        showToast('AI 已生成技能，请检查并保存', 'success');
      } else {
        showToast(resp.error || '生成失败，请重试', 'error');
      }
    } catch {
      showToast('网络错误', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleCreate = async () => {
    const { name, displayName, description, promptTemplate, tags, category, visibility } = createForm;
    if (!name.trim() || !displayName.trim() || !promptTemplate.trim()) {
      showToast('名称、显示名和 Prompt 模板必填', 'error');
      return;
    }
    setCreating(true);
    try {
      const resp = await apiClient.post<SkillDefinition>('/assistant/skills', {
        action: 'create',
        name: name.trim(),
        displayName: displayName.trim(),
        description: description.trim(),
        category: category || undefined,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        promptTemplate: promptTemplate.trim(),
        visibility,
      });
      if (resp.success) {
        showToast('技能创建成功', 'success');
        setShowCreate(false);
        setCreateForm({ name: '', displayName: '', description: '', category: '', tags: '', promptTemplate: '', visibility: 'private' });
        setAiDescription('');
        setCreateMode('ai');
        refetch();
      } else {
        showToast(resp.error || '创建失败', 'error');
      }
    } catch {
      showToast('网络错误', 'error');
    } finally {
      setCreating(false);
    }
  };

  const { data: skills, isLoading, error, refetch } = useSkills({
    action: tab === 'installed' ? 'installed' : category ? 'list' : 'list',
    category: tab === 'installed' ? undefined : (category || undefined),
    query: searchQuery || undefined,
  });

  const { data: installedIds } = useInstalledSkillIds();

  const { data: skillDetail } = useSkill(detailId ?? undefined);
  const installSkill = useInstallSkill();
  const uninstallSkill = useUninstallSkill();

  const handleSearch = () => {
    setSearchQuery(searchInput.trim());
  };

  const handleInstall = async (skillId: string) => {
    setInstalling(skillId);
    try {
      await installSkill.mutateAsync(skillId);
      showToast('安装成功', 'success');
      refetch();
    } catch {
      showToast('安装失败', 'error');
    } finally {
      setInstalling(null);
    }
  };

  const handleUninstall = async (skillId: string) => {
    if (!confirm('确定卸载这个技能吗？')) return;
    try {
      await uninstallSkill.mutateAsync(skillId);
      showToast('已卸载', 'success');
      refetch();
    } catch {
      showToast('卸载失败', 'error');
    }
  };

  const handleNavigate = (page: PageKey) => {
    switch (page) {
      case 'home': router.push('/home'); break;
      case 'inspiration': router.push('/inspiration'); break;
      case 'ai': router.push('/ai'); break;
      case 'profile': router.push('/profile'); break;
      default: router.push('/profile'); break;
    }
  };

  const getCategoryIcon = (cat?: string) => {
    const found = CATEGORIES.find(c => c.value === cat);
    return found?.icon || '🧩';
  };

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <TopNav title="Skills Hub" showBack onBack={() => router.push('/profile')} />

      <div className="flex-1 px-4 pt-4 space-y-4">
        {/* 说明卡片 */}
        <GlassCard className="!p-4">
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(34,211,238,0.2)', border: '1px solid rgba(34,211,238,0.3)' }}
            >
              <Puzzle size={20} color="#22D3EE" />
            </div>
            <div>
              <p style={{ color: '#E5E7EB', fontSize: 14, fontWeight: 600 }}>技能扩展市场</p>
              <p style={{ color: '#9CA3AF', fontSize: 12 }} className="mt-1">
                安装技能让 AI 合伙人获得专业领域能力。每个技能都有专属的 Prompt 指令集。
              </p>
            </div>
          </div>
        </GlassCard>

        {/* Tab 切换 + 搜索 + 创建 */}
        <div className="flex gap-2">
          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
            <button
              onClick={() => setTab('hub')}
              className="px-4 py-2 text-sm transition-colors"
              style={{
                background: tab === 'hub' ? 'rgba(59,130,246,0.2)' : 'transparent',
                color: tab === 'hub' ? '#93C5FD' : '#9CA3AF',
              }}
            >
              技能市场
            </button>
            <button
              onClick={() => setTab('installed')}
              className="px-4 py-2 text-sm transition-colors"
              style={{
                background: tab === 'installed' ? 'rgba(59,130,246,0.2)' : 'transparent',
                color: tab === 'installed' ? '#93C5FD' : '#9CA3AF',
              }}
            >
              已安装
            </button>
          </div>
          <div className="flex-1 relative">
            <Search size={14} color="#6B7280" className="absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="搜索技能..."
              className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#E5E7EB',
              }}
            />
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-2 rounded-xl text-sm flex items-center gap-1 flex-shrink-0"
            style={{ background: 'rgba(34,211,238,0.15)', color: '#67E8F9', border: '1px solid rgba(34,211,238,0.3)' }}
          >
            <Plus size={14} /> 创建
          </button>
        </div>

        {/* 分类筛选（仅在市场 tab 显示） */}
        {tab === 'hub' && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map(c => (
              <button
                key={c.value}
                onClick={() => setCategory(c.value)}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1"
                style={{
                  background: category === c.value ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.06)',
                  border: category === c.value ? '1px solid rgba(34,211,238,0.4)' : '1px solid rgba(255,255,255,0.08)',
                  color: category === c.value ? '#67E8F9' : '#9CA3AF',
                }}
              >
                <span>{c.icon}</span> {c.label}
              </button>
            ))}
          </div>
        )}

        {/* 内容区域 */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <LoadingSpinner text="加载技能..." />
          </div>
        ) : error ? (
          <ErrorState message="加载失败" onRetry={() => refetch()} />
        ) : !skills?.length ? (
          <EmptyState
            icon={<Puzzle size={40} color="#6B7280" />}
            title={searchQuery ? '没有匹配的技能' : (tab === 'installed' ? '还没有安装任何技能' : '暂无可用技能')}
            description={searchQuery ? '尝试其他搜索词' : (tab === 'installed' ? '去技能市场发现更多' : '稍后再来看看')}
          />
        ) : (
          <div className="space-y-2">
            {skills.map((skill: SkillDefinition) => {
              const isInstalled = installedIds?.has(skill.id);
              return (
              <GlassCard key={skill.id} className="!p-3">
                <div className="flex items-start gap-3">
                  <span className="text-xl flex-shrink-0 mt-0.5">
                    {getCategoryIcon(skill.category)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        onClick={() => setDetailId(detailId === skill.id ? null : skill.id)}
                        className="cursor-pointer hover:underline"
                        style={{ color: '#E5E7EB', fontSize: 14, fontWeight: 600 }}
                      >
                        {skill.displayName}
                      </span>
                      {skill.visibility === 'official' && (
                        <span style={{ color: '#F59E0B', fontSize: 9 }}>⭐ 官方</span>
                      )}
                      {tab === 'hub' && isInstalled && (
                        <span className="px-1.5 py-0.5 rounded text-[9px]" style={{ background: 'rgba(34,197,94,0.15)', color: '#4ADE80' }}>
                          已安装
                        </span>
                      )}
                      <span style={{ color: '#6B7280', fontSize: 10 }}>v{skill.version}</span>
                    </div>
                    <p style={{ color: '#9CA3AF', fontSize: 12 }} className="mt-1 line-clamp-2">
                      {skill.description}
                    </p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {skill.tags?.map(tag => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 rounded text-[9px]"
                          style={{ background: 'rgba(255,255,255,0.06)', color: '#9CA3AF' }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span style={{ color: '#6B7280', fontSize: 10 }}>
                        {skill.installCount ?? 0} 次安装
                      </span>
                    </div>

                    {/* 技能详情（展开） */}
                    {detailId === skill.id && skillDetail && (
                      <div
                        className="mt-3 p-3 rounded-xl space-y-2"
                        style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}
                      >
                        <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600 }}>Prompt 模板</p>
                        <pre
                          className="text-[11px] whitespace-pre-wrap leading-relaxed p-2 rounded-lg"
                          style={{ background: 'rgba(0,0,0,0.3)', color: '#D1D5DB' }}
                        >
                          {skillDetail.promptTemplate.slice(0, 500)}
                          {skillDetail.promptTemplate.length > 500 && '...'}
                        </pre>
                      </div>
                    )}
                  </div>

                  <div className="flex-shrink-0 flex items-center gap-1">
                    <button
                      onClick={() => setDetailId(detailId === skill.id ? null : skill.id)}
                      className="p-1.5 rounded-lg hover:bg-white/5"
                      title="查看详情"
                    >
                      <ChevronRight
                        size={14}
                        color="#6B7280"
                        style={{ transform: detailId === skill.id ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}
                      />
                    </button>
                    {(tab === 'installed' || isInstalled) ? (
                      <button
                        onClick={() => handleUninstall(skill.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10"
                        title="卸载"
                      >
                        <Trash2 size={14} color="#EF4444" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleInstall(skill.id)}
                        disabled={installing === skill.id}
                        className="p-1.5 rounded-lg hover:bg-blue-500/10"
                        title="安装"
                      >
                        {installing === skill.id ? (
                          <div className="w-3.5 h-3.5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                        ) : (
                          <Download size={14} color="#3B82F6" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </GlassCard>
              );
            })}
          </div>
        )}
      </div>

      

      {/* 创建技能弹窗 */}
      {showCreate && (
        <>
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="fixed inset-x-4 top-8 bottom-8 z-50 overflow-y-auto mx-auto max-w-[448px]">
            <div
              className="rounded-2xl p-5 space-y-4"
              style={{ background: 'rgba(15,23,42,0.98)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              <div className="flex items-center justify-between">
                <h3 style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 600 }}>创建技能</h3>
                <button onClick={() => setShowCreate(false)} className="p-1 rounded-lg hover:bg-white/5">
                  <X size={18} color="#9CA3AF" />
                </button>
              </div>

              {/* 模式切换 */}
              <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                <button
                  onClick={() => setCreateMode('ai')}
                  className="flex-1 py-2 text-sm transition-colors"
                  style={{
                    background: createMode === 'ai' ? 'rgba(34,211,238,0.2)' : 'transparent',
                    color: createMode === 'ai' ? '#67E8F9' : '#9CA3AF',
                  }}
                >
                  AI 生成
                </button>
                <button
                  onClick={() => setCreateMode('manual')}
                  className="flex-1 py-2 text-sm transition-colors"
                  style={{
                    background: createMode === 'manual' ? 'rgba(34,211,238,0.2)' : 'transparent',
                    color: createMode === 'manual' ? '#67E8F9' : '#9CA3AF',
                  }}
                >
                  手动编辑
                </button>
              </div>

              {/* AI 生成模式 */}
              {createMode === 'ai' && (
                <div className="space-y-3">
                  <p style={{ color: '#9CA3AF', fontSize: 12 }}>
                    用自然语言描述你想要的技能，AI 会自动生成完整的技能定义。
                  </p>
                  <textarea
                    value={aiDescription}
                    onChange={e => setAiDescription(e.target.value)}
                    placeholder={'例如：\n"帮我写小红书爆款文案，包括标题、正文和话题标签"\n"分析热点新闻，挖掘创作角度"\n"为我的产品生成 SEO 友好的推广标题"'}
                    rows={6}
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#E5E7EB' }}
                  />
                  <button
                    onClick={handleGenerate}
                    disabled={generating || !aiDescription.trim()}
                    className="w-full py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
                    style={{
                      background: generating ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, rgba(34,211,238,0.3), rgba(59,130,246,0.3))',
                      color: generating ? '#6B7280' : '#FFFFFF',
                    }}
                  >
                    {generating ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        AI 生成中...
                      </>
                    ) : (
                      '生成技能'
                    )}
                  </button>
                </div>
              )}

              {/* 手动编辑模式 */}
              {createMode === 'manual' && (
                <>
                  {/* name */}
                  <div>
                    <label style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4, display: 'block' }}>英文标识 *</label>
                    <input
                      value={createForm.name}
                      onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="例: my-awesome-skill"
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#E5E7EB' }}
                    />
                  </div>

                  {/* displayName */}
                  <div>
                    <label style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4, display: 'block' }}>显示名称 *</label>
                    <input
                      value={createForm.displayName}
                      onChange={e => setCreateForm(f => ({ ...f, displayName: e.target.value }))}
                      placeholder="例: 小红书文案优化"
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#E5E7EB' }}
                    />
                  </div>

                  {/* description */}
                  <div>
                    <label style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4, display: 'block' }}>简介</label>
                    <input
                      value={createForm.description}
                      onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="一句话描述这个技能做什么"
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#E5E7EB' }}
                    />
                  </div>

                  {/* category + visibility */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4, display: 'block' }}>分类</label>
                      <select
                        value={createForm.category}
                        onChange={e => setCreateForm(f => ({ ...f, category: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#E5E7EB' }}
                      >
                        <option value="" style={{ background: '#0F172A' }}>选择分类</option>
                        {CATEGORIES.filter(c => c.value).map(c => (
                          <option key={c.value} value={c.value} style={{ background: '#0F172A' }}>{c.icon} {c.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4, display: 'block' }}>可见性</label>
                      <select
                        value={createForm.visibility}
                        onChange={e => setCreateForm(f => ({ ...f, visibility: e.target.value as 'private' | 'public' }))}
                        className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#E5E7EB' }}
                      >
                        <option value="private" style={{ background: '#0F172A' }}>🔒 私有</option>
                        <option value="public" style={{ background: '#0F172A' }}>🌐 公开</option>
                      </select>
                    </div>
                  </div>

                  {/* tags */}
                  <div>
                    <label style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4, display: 'block' }}>标签（逗号分隔）</label>
                    <input
                      value={createForm.tags}
                      onChange={e => setCreateForm(f => ({ ...f, tags: e.target.value }))}
                      placeholder="例: 小红书, 文案, 社交媒体"
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#E5E7EB' }}
                    />
                  </div>

                  {/* promptTemplate */}
                  <div>
                    <label style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4, display: 'block' }}>Prompt 模板 *</label>
                    <textarea
                      value={createForm.promptTemplate}
                      onChange={e => setCreateForm(f => ({ ...f, promptTemplate: e.target.value }))}
                      placeholder="编写技能的核心指令，这将是注入到 AI System Prompt 中的内容..."
                      rows={8}
                      className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#E5E7EB' }}
                    />
                  </div>

                  {/* actions */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => { setCreateMode('ai'); }}
                      className="flex-1 py-2.5 rounded-xl text-sm"
                      style={{ background: 'rgba(255,255,255,0.06)', color: '#9CA3AF' }}
                    >
                      返回 AI 生成
                    </button>
                    <button
                      onClick={handleCreate}
                      disabled={creating}
                      className="flex-1 py-2.5 rounded-xl text-sm flex items-center justify-center gap-1"
                      style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.3), rgba(59,130,246,0.3))', color: '#FFFFFF' }}
                    >
                      {creating ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        '保存技能'
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function SkillsPage() {
  return (
    <ProtectedRoute>
      <SkillsContent />
    </ProtectedRoute>
  );
}
