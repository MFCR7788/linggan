'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Send, Loader2, ExternalLink, CheckCircle2, AlertCircle, X, Trash2, Clock, ChevronRight, Link2, Plus } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Toast } from '@/components/Toast';
import { TopNav } from '@/components/TopNav';
import { WorkflowStepper } from '@/components/WorkflowStepper';
import { PageKey } from "@/components/BottomNav";
import { ProtectedRoute } from '@/components';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { apiClient } from '@/lib/api-client';
import { useContentHandoff } from '@/hooks/use-content-handoff';
import { PLATFORMS, type PlatformId } from '@/lib/platforms/types';
import { ManualMetricsForm } from '@/components/ManualMetricsForm';

interface PlatformAccount {
  id: string;
  platform: string;
  account_name: string;
  account_avatar: string | null;
  open_id: string | null;
  expires_at: string | null;
  status: string;
  last_used_at: string | null;
  created_at: string;
}

interface Publication {
  id: string;
  platform: string;
  title: string;
  content: string;
  cover_url: string | null;
  status: string;
  is_manual_post: boolean;
  external_url: string | null;
  external_post_id: string | null;
  scheduled_publish_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  platform_accounts: { account_name: string; account_avatar: string | null } | null;
}

const ALL_PLATFORMS: PlatformId[] = ['wechat_mp', 'weibo', 'douyin', 'xiaohongshu', 'wechat_video', 'bilibili'];

function PublishContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { receive } = useContentHandoff();

  // handoff + URL 参数
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [tags, setTags] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<Record<PlatformId, string>>({} as any);
  const [scheduledAt, setScheduledAt] = useState('');

  useEffect(() => {
    const params = receive(['prompt', 'imageUrl', 'text']);
    const sp = searchParams.get('platform');
    if (params.prompt) {
      setTitle(params.prompt.substring(0, 80));
      setContent(params.prompt);
    }
    if (params.text) {
      setContent(params.text);
      // 尝试用 text 第一行作为 title
      const firstLine = params.text.split('\n')[0];
      if (firstLine && firstLine.length < 100) setTitle(firstLine);
    }
    if (params.imageUrl) setCoverUrl(params.imageUrl);
    if (sp) {
      const p = sp as PlatformId;
      if (ALL_PLATFORMS.includes(p)) setSelectedPlatforms([p]);
    }
  }, []);

  // OAuth 回调结果
  useEffect(() => {
    const ok = searchParams.get('oauth_success');
    const err = searchParams.get('oauth_error');
    if (ok) setToast({ message: `${ok} 授权成功!`, type: 'success' });
    if (err) setToast({ message: err, type: 'error' });
  }, [searchParams]);

  // 账号列表 + 发布记录
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);

  const loadData = async () => {
    setLoadingAccounts(true);
    try {
      const [accRes, pubRes] = await Promise.all([
        apiClient.get<{ accounts: PlatformAccount[] }>('/platforms/accounts'),
        apiClient.get<{ publications: Publication[] }>('/platforms/publications?limit=20'),
      ]);
      if (accRes.success) setAccounts(accRes.data?.accounts || []);
      if (pubRes.success) setPublications(pubRes.data?.publications || []);
    } catch (e) {
      // 静默
    } finally {
      setLoadingAccounts(false);
    }
  };
  useEffect(() => { loadData(); }, []);

  // 授权
  const handleAuthorize = async (platform: PlatformId) => {
    try {
      const res = await apiClient.post<{ authorizeUrl: string }>(`/platforms/oauth/${platform}`, {});
      if (res.success && res.data) {
        window.location.href = res.data.authorizeUrl;
      } else {
        setToast({ message: res.error || '获取授权链接失败', type: 'error' });
      }
    } catch (e: any) {
      setToast({ message: (e instanceof Error ? e.message : '') || '操作失败，请重试', type: 'error' });
    }
  };

  // 解除授权
  const handleRevoke = (accountId: string) => {
    setRevokeTarget(accountId);
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await apiClient.delete(`/platforms/accounts?accountId=${revokeTarget}`);
      setToast({ message: '已解除授权', type: 'success' });
      loadData();
    } catch (e: any) {
      setToast({ message: (e instanceof Error ? e.message : '') || '操作失败，请重试', type: 'error' });
    }
    setRevokeTarget(null);
  };

  // 切换平台
  const togglePlatform = (p: PlatformId) => {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  // 发布
  const handlePublish = async () => {
    if (!title.trim()) {
      setToast({ message: '请填写标题', type: 'error' });
      return;
    }
    if (selectedPlatforms.length === 0) {
      setToast({ message: '请选择至少一个平台', type: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      const tagArr = tags.split(/[,，#\s]+/).filter((t) => t.trim());
      const results: Array<{ platform: PlatformId; success: boolean; msg: string; publicationId?: string }> = [];

      for (const p of selectedPlatforms) {
        const meta = PLATFORMS[p];
        if (meta.autoPublish) {
          // 2 平台自动
          const accountId = selectedAccountId[p];
          if (!accountId) {
            results.push({ platform: p, success: false, msg: '未选择账号' });
            continue;
          }
          const res = await apiClient.post<{ externalUrl: string }>('/platforms/publish', {
            platform: p,
            accountId,
            title: title.trim(),
            content: content.trim(),
            coverUrl: coverUrl || undefined,
            tags: tagArr,
            scheduledPublishAt: scheduledAt || undefined,
          });
          if (res.success) {
            results.push({ platform: p, success: true, msg: `已发布 ${res.data?.externalUrl ? '' : '成功'}` });
          } else {
            results.push({ platform: p, success: false, msg: res.error || '发布失败' });
          }
        } else {
          // 4 平台手动
          const res = await apiClient.post<{ publication: Publication }>('/platforms/publish-manual', {
            platform: p,
            title: title.trim(),
            content: content.trim(),
            coverUrl: coverUrl || undefined,
            tags: tagArr,
            scheduledPublishAt: scheduledAt || undefined,
          });
          if (res.success) {
            results.push({ platform: p, success: true, msg: '草稿已创建', publicationId: res.data?.publication.id });
          } else {
            results.push({ platform: p, success: false, msg: res.error || '创建失败' });
          }
        }
      }

      const successCount = results.filter((r) => r.success).length;
      setToast({
        message: `${successCount}/${results.length} 平台已处理`,
        type: successCount === results.length ? 'success' : 'error',
      });
      loadData();

      // 4 平台手动 → 跳到复制引导页(支持多个)
      const manualPubs = results.filter((r) => r.success && r.publicationId);
      if (manualPubs.length > 0) {
        const ids = manualPubs.map((r) => r.publicationId).join(',');
        router.push(`/insights/publish-guide?ids=${ids}`);
      }
    } catch (e: any) {
      setToast({ message: e.message, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleNavigate = (page: PageKey) => {
    const map: Partial<Record<PageKey, string>> = {
      home: '/home', inspiration: '/inspiration', ai: '/ai',
      hotspot: '/hotspot', profile: '/profile',
    };
    router.push(map[page] || '/home');
  };

  const accountsByPlatform = (p: PlatformId) =>
    accounts.filter((a) => a.platform === p && a.status === 'active');

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <TopNav title="多平台分发" showBack onBack={() => router.push('/ai')} />

      {/* 工作流步骤(标识当前在第 6 步) */}
      <div className="px-4 pt-3">
        <WorkflowStepper completed={[0, 1, 2, 3, 4]} compact />
      </div>

      <div className="flex-1 px-4 pt-4 space-y-4 min-w-0">
        {/* 顶部说明 */}
        <GlassCard className="!p-3">
          <div className="flex items-start gap-2">
            <Send size={16} color="#8B5CF6" />
            <div className="flex-1">
              <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>多平台一键分发</p>
              <p style={{ color: '#9CA3AF', fontSize: 11, lineHeight: 1.5, marginTop: 2 }}>
                公众号/微博支持 OAuth 自动发布;抖音/小红书/视频号/B站使用复制引导页手动发布。
              </p>
            </div>
          </div>
        </GlassCard>

        {/* Step 1: 内容 */}
        <GlassCard>
          <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            <span style={{ color: '#3B82F6' }}>Step 1</span> · 内容
          </p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="标题"
            maxLength={100}
            className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none mb-2"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#E5E7EB' }}
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="正文..."
            maxLength={2000}
            rows={5}
            className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none resize-none mb-2"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#E5E7EB' }}
          />
          {coverUrl ? (
            <div className="relative inline-block">
              <img src={coverUrl} alt="cover" className="w-20 h-20 rounded-lg object-cover" />
              <button
                onClick={() => setCoverUrl('')}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(239,68,68,0.8)' }}
              >
                <X size={10} color="#fff" />
              </button>
            </div>
          ) : null}
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="标签 (用空格或 # 分隔, 选填)"
            maxLength={100}
            className="w-full px-3 py-2 rounded-lg text-xs bg-transparent outline-none mt-2"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#E5E7EB' }}
          />
        </GlassCard>

        {/* Step 2: 平台选择 */}
        <GlassCard>
          <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            <span style={{ color: '#8B5CF6' }}>Step 2</span> · 选择平台
          </p>
          <div className="grid grid-cols-3 gap-2">
            {ALL_PLATFORMS.map((p) => {
              const meta = PLATFORMS[p];
              const isSelected = selectedPlatforms.includes(p);
              return (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className="p-2 rounded-lg flex flex-col items-center gap-1 relative"
                  style={{
                    background: isSelected ? `${meta.color}22` : 'rgba(255,255,255,0.03)',
                    border: isSelected ? `1px solid ${meta.color}88` : '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <span style={{ fontSize: 20 }}>{meta.emoji}</span>
                  <span style={{ color: isSelected ? '#FFFFFF' : '#9CA3AF', fontSize: 10, fontWeight: 600 }}>
                    {meta.name}
                  </span>
                  <span style={{ color: '#6B7280', fontSize: 8 }}>
                    {meta.autoPublish ? '自动' : '手动'}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 自动平台选账号 */}
          {selectedPlatforms.some((p) => PLATFORMS[p].autoPublish) && (
            <div className="mt-3 space-y-2">
              {selectedPlatforms.filter((p) => PLATFORMS[p].autoPublish).map((p) => {
                const accs = accountsByPlatform(p);
                return (
                  <div key={p} className="flex items-center gap-2">
                    <span style={{ color: '#9CA3AF', fontSize: 11, minWidth: 60 }}>{PLATFORMS[p].name}</span>
                    {accs.length > 0 ? (
                      <select
                        value={selectedAccountId[p] || ''}
                        onChange={(e) => setSelectedAccountId((prev) => ({ ...prev, [p]: e.target.value }))}
                        className="flex-1 px-2 py-1.5 rounded-md text-xs outline-none"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#E5E7EB' }}
                      >
                        <option value="">选择账号</option>
                        {accs.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.account_name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <button
                        onClick={() => handleAuthorize(p)}
                        className="flex-1 px-2 py-1.5 rounded-md text-xs flex items-center justify-center gap-1"
                        style={{
                          background: `${PLATFORMS[p].color}22`,
                          border: `1px solid ${PLATFORMS[p].color}66`,
                          color: PLATFORMS[p].color,
                        }}
                      >
                        <Link2 size={11} /> 授权 {PLATFORMS[p].name}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>

        {/* Step 3: 定时(可选) */}
        <GlassCard>
          <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            <span style={{ color: '#22C55E' }}>Step 3</span> · 定时发布 (可选)
          </p>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-xs outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#E5E7EB', colorScheme: 'dark' }}
          />
          {scheduledAt && (
            <p style={{ color: '#86EFAC', fontSize: 10, marginTop: 4 }} className="flex items-center gap-1">
              <Clock size={10} /> 到点自动发布
            </p>
          )}
        </GlassCard>

        {/* 发布按钮 */}
        <PrimaryButton
          fullWidth
          size="lg"
          onClick={handlePublish}
          disabled={submitting || !title.trim() || selectedPlatforms.length === 0}
        >
          {submitting ? (
            <><Loader2 size={16} className="animate-spin" /> 发布中...</>
          ) : (
            <><Send size={16} /> 立即发布 ({selectedPlatforms.length})</>
          )}
        </PrimaryButton>

        {/* 已连接账号 */}
        {accounts.length > 0 && (
          <GlassCard>
            <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              已连接账号
            </p>
            <div className="space-y-2">
              {accounts.map((a) => {
                const meta = PLATFORMS[a.platform as PlatformId];
                return (
                  <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    {a.account_avatar ? (
                      <img src={a.account_avatar} alt="" className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-base" style={{ background: `${meta?.color}22` }}>
                        {meta?.emoji}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p style={{ color: '#FFFFFF', fontSize: 12, fontWeight: 600 }} className="truncate">
                        {a.account_name}
                      </p>
                      <p style={{ color: '#6B7280', fontSize: 10 }}>{meta?.name}</p>
                    </div>
                    <button
                      onClick={() => handleRevoke(a.id)}
                      className="p-1.5"
                      title="解除"
                    >
                      <Trash2 size={12} color="#FCA5A5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        )}

        {/* 发布记录 */}
        {publications.length > 0 && (
          <GlassCard>
            <p style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              最近发布
            </p>
            <div className="space-y-2">
              {publications.slice(0, 10).map((p) => {
                const meta = PLATFORMS[p.platform as PlatformId];
                const statusColor =
                  p.status === 'published' ? '#86EFAC' :
                  p.status === 'failed' ? '#FCA5A5' :
                  p.status === 'scheduled' ? '#FCD34D' :
                  p.status === 'publishing' ? '#93C5FD' : '#9CA3AF';
                const statusText =
                  p.status === 'published' ? '已发布' :
                  p.status === 'failed' ? '失败' :
                  p.status === 'scheduled' ? '待发布' :
                  p.status === 'publishing' ? '发布中' : '草稿';
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      if (p.is_manual_post && p.status === 'draft') {
                        router.push(`/insights/publish-guide?ids=${p.id}`);
                      } else {
                        router.push(`/publish/${p.id}`);
                      }
                    }}
                    className="w-full flex items-center gap-2 p-2 rounded-lg text-left"
                    style={{ background: 'rgba(255,255,255,0.03)' }}
                  >
                    <span style={{ fontSize: 14 }}>{meta?.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p style={{ color: '#E5E7EB', fontSize: 12 }} className="truncate">
                        {p.title}
                      </p>
                      <p style={{ color: '#6B7280', fontSize: 10, marginTop: 1 }}>
                        {new Date(p.created_at).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px]"
                      style={{ background: `${statusColor}22`, color: statusColor }}
                    >
                      {statusText}
                    </span>
                    <ChevronRight size={12} color="#6B7280" />
                  </button>
                );
              })}
            </div>
          </GlassCard>
        )}
      </div>

      
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <ConfirmDialog
        open={!!revokeTarget}
        title="解除授权"
        message="确定解除该账号授权?"
        confirmLabel="解除"
        danger
        onConfirm={confirmRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}

export default function PublishPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p style={{ color: '#9CA3AF' }}>加载中...</p></div>}>
        <PublishContent />
      </Suspense>
    </ProtectedRoute>
  );
}
