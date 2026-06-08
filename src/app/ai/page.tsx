"use client";

import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Image as ImageIcon, Video as VideoIcon, Music, Mic, ChevronRight, Play, FileAudio, Grid3x3, BarChart3, Send, Sparkles, ArrowRight, Trash2, TrendingUp, Scissors, Plus, Wrench, CheckSquare, X, Check, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import { TopNav } from "@/components/TopNav";
import { BottomNav, PageKey } from "@/components/BottomNav";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components";
import { Toast } from "@/components/Toast";
import { AccountTypeOnboarding } from "@/components/AccountTypeOnboarding";
import { CreditsWarningBanner } from "@/components/CreditsWarningBanner";
import { useInspirations } from "@/hooks/use-inspiration";
import { useAccountType } from "@/hooks/use-account-type";
import { getRecommendations, ACCOUNT_TYPE_PRESETS, type AccountTypeId } from "@/lib/account-presets";
import { useWorkflowSessions, useWorkflowSession } from "@/hooks/use-workflow-session";
import { WorkflowSessionCard } from "@/components/WorkflowSessionCard";
import { TYPE_EMOJIS, TYPE_LABELS } from "@/lib/style-constants";
import { apiClient } from "@/lib/api-client";
import { CustomComboBuilder, getCustomCombos } from "@/components/CustomComboBuilder";
import { JargonTooltip } from "@/components/JargonTooltip";

// ─── AI 创作工具 ──────────────────────────────
interface AITool {
  icon: React.ReactNode;
  title: string;
  desc: string;
  color: string;
  page?: PageKey;
  path?: string;
  badge?: string;
}

const aiCreationTools: AITool[] = [
  { icon: <FileText size={28} />, title: "AI 文案", desc: "输入主题，自动写出小红书、公众号、短视频等各种文案", color: "#3B82F6", page: "ai-copywriting" as PageKey },
  { icon: <ImageIcon size={28} />, title: "AI 图片", desc: "输入描述，AI 自动生成封面图、配图、海报", color: "#8B5CF6", page: "ai-image" as PageKey },
  { icon: <Scissors size={28} />, title: "AI 图片编辑", desc: "给图片去背景、变清晰、智能扩展", color: "#A78BFA", path: "/ai/image-editor", badge: "新" },
  { icon: <Music size={28} />, title: "AI 配音", desc: "把文字转成自然语音，多种音色可选", color: "#22C55E", page: "ai-tts" as PageKey },
  { icon: <Mic size={28} />, title: "AI 数字人", desc: "用虚拟主播替你出镜讲解，无需真人拍摄", color: "#06B6D4", page: "ai-digital-human" as PageKey },
  { icon: <VideoIcon size={28} />, title: "AI 视频", desc: "输入文案，自动合成带字幕和配乐的短视频", color: "#F43F5E", page: "ai-video" as PageKey },
  { icon: <Grid3x3 size={28} />, title: "9 宫格", desc: "AI 智能生成 9 张朋友圈配图，支持 6 种场景", color: "#F59E0B", page: "ai-ads" as PageKey },
  { icon: <TrendingUp size={28} />, title: "AI 热点选题", desc: "发现当下热门话题，帮你找到创作灵感", color: "#EF4444", path: "/hotspot" },
  { icon: <Send size={28} />, title: "多平台分发", desc: "一键把内容发布到小红书、公众号等多个平台", color: "#F43F5E", path: "/publish" },
];

// ─── 数据 ──────────────────────────────
const utilityTools: AITool[] = [
  { icon: <BarChart3 size={20} />, title: "效果数据", desc: "公众号/微博自动抓 + 手动录入", color: "#06B6D4", path: "/insights" },
];

function AICreationContent() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showCustomBuilder, setShowCustomBuilder] = useState(false);
  const [customCombos, setCustomCombos] = useState<ReturnType<typeof getCustomCombos>>([]);
  const [manageMode, setManageMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [highlightFirstCombo, setHighlightFirstCombo] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { accountType, preset, setAccountType } = useAccountType();
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [switchingId, setSwitchingId] = useState<AccountTypeId | null>(null);
  const recommendations = getRecommendations(accountType);

  // 工作流会话
  const { createSession, isCreating } = useWorkflowSession(null);
  const { data: activeSessions = [] } = useWorkflowSessions({ status: 'active' });
  const { data: pausedSessions = [] } = useWorkflowSessions({ status: 'paused' });
  // 按 combo_id 去重:同方案只保留最新一条,active 优先于 paused
  const allRaw = [...activeSessions, ...pausedSessions];
  const inProgressSessions = (() => {
    const seen = new Map<string, (typeof allRaw)[number]>();
    for (const s of allRaw) {
      const existing = seen.get(s.combo_id);
      if (!existing || (s.status === 'active' && existing.status !== 'active') || s.updated_at > existing.updated_at) {
        seen.set(s.combo_id, s);
      }
    }
    return Array.from(seen.values()).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  })();
  const duplicateCount = allRaw.length - inProgressSessions.length;

  // 清理重复会话:同一 combo_id 只留最新一条,其余软删除
  const handleCleanDuplicates = useCallback(async () => {
    setCleaning(true);
    const keepIds = new Set(inProgressSessions.map((s) => s.id));
    const toDelete = allRaw.filter((s) => !keepIds.has(s.id));
    try {
      await Promise.all(toDelete.map((s) => apiClient.delete(`/workflow/sessions/${s.id}`)));
      queryClient.invalidateQueries({ queryKey: ['workflow-sessions'] });
      setToast({ message: `已清理 ${toDelete.length} 条重复会话`, type: 'success' });
    } catch {
      setToast({ message: '清理失败，请重试', type: 'error' });
    } finally {
      setCleaning(false);
    }
  }, [allRaw, inProgressSessions, queryClient]);

  // 切换管理模式时清空选中
  const toggleManageMode = useCallback(() => {
    setManageMode((prev) => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }, []);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === inProgressSessions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(inProgressSessions.map((s) => s.id)));
    }
  }, [inProgressSessions, selectedIds.size]);

  const handleDeleteOne = useCallback(async (id: string) => {
    try {
      await apiClient.delete(`/workflow/sessions/${id}`);
      queryClient.invalidateQueries({ queryKey: ['workflow-sessions'] });
      setToast({ message: '已删除', type: 'success' });
    } catch {
      setToast({ message: '删除失败', type: 'error' });
    }
  }, [queryClient]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) => apiClient.delete(`/workflow/sessions/${id}`))
      );
      queryClient.invalidateQueries({ queryKey: ['workflow-sessions'] });
      setSelectedIds(new Set());
      setManageMode(false);
      setToast({ message: `已删除 ${selectedIds.size} 条会话`, type: 'success' });
    } catch {
      setToast({ message: '批量删除失败，请重试', type: 'error' });
    } finally {
      setDeleting(false);
    }
  }, [selectedIds, queryClient]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (accountType) return;
    const done = localStorage.getItem('lingji_onboarding_done');
    if (done) return;
    const t = setTimeout(() => setShowOnboarding(true), 500);
    return () => clearTimeout(t);
  }, [accountType]);

  // 首次引导：有推荐方案时高亮第一个
  useEffect(() => {
    if (!accountType || recommendations.length === 0) return;
    const key = 'lingji_first_combo_highlight';
    if (localStorage.getItem(key) !== 'done') {
      setHighlightFirstCombo(true);
    }
  }, [accountType, recommendations.length]);

  // 加载自定义方案
  useEffect(() => {
    setCustomCombos(getCustomCombos());
  }, []);

  const handleSaveCustomCombo = (combo: ReturnType<typeof getCustomCombos>[number]) => {
    setCustomCombos((prev) => [...prev, combo]);
    setShowCustomBuilder(false);
    setToast({ message: '自定义方案已保存', type: 'success' });
  };

  const handleDeleteCustomCombo = (id: string) => {
    const next = customCombos.filter((c) => c.id !== id);
    setCustomCombos(next);
    try { localStorage.setItem('lingji_custom_combos', JSON.stringify(next)); } catch {}
  };

  const closeOnboarding = () => {
    setShowOnboarding(false);
    try { localStorage.setItem('lingji_onboarding_done', '1'); } catch {}
  };

  const { data: aiWorks = [], isLoading: loadingWorks } = useInspirations({
    sourcePlatform: 'ai',
    limit: 6,
    sortBy: 'created_at',
    sortOrder: 'desc',
  });

  const handleNavigate = (page: PageKey) => {
    const map: Record<string, string> = {
      home: '/home', inspiration: '/inspiration', 'ai-copywriting': '/ai/copywriting',
      'ai-image': '/ai/image', 'ai-video': '/ai/video', 'ai-tts': '/ai/tts',
      'ai-digital-human': '/ai/digital-human', 'ai-ads': '/ai/ads',
      hotspot: '/hotspot', profile: '/profile',
    };
    router.push(map[page] || '/home');
  };

  const handleStartCombo = async (combo: (typeof recommendations)[number]) => {
    try {
      await createSession(combo, { accountType });
    } catch (e: any) {
      setToast({ message: e.message || '创建失败', type: 'error' });
    }
  };

  const sectionLabel: React.CSSProperties = {
    color: '#9CA3AF', fontSize: 11, fontWeight: 600,
    letterSpacing: '0.05em', textTransform: 'uppercase',
  };

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <TopNav title="AI 创作" />
      <CreditsWarningBanner />

      <div className="flex-1 px-4 pt-4 space-y-5">

        {/* ─── 1. 继续创作 (最高优先级) ─── */}
        {inProgressSessions.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles size={14} color="#FBBF24" />
              <p style={sectionLabel}>继续创作</p>
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                style={{ background: 'rgba(251,191,36,0.15)', color: '#FBBF24' }}
              >
                {inProgressSessions.length}
              </span>
              {!manageMode && duplicateCount > 0 && (
                <button
                  onClick={handleCleanDuplicates}
                  disabled={cleaning}
                  className="px-2 py-1 rounded-lg flex items-center gap-1 text-[10px] font-medium transition-all hover:opacity-80"
                  style={{
                    background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    color: '#FCA5A5',
                    opacity: cleaning ? 0.5 : 1,
                  }}
                >
                  <Trash2 size={10} />
                  {cleaning ? '清理中...' : `清理 ${duplicateCount} 条重复`}
                </button>
              )}
              <button
                onClick={toggleManageMode}
                className={`ml-auto px-2.5 py-1 rounded-lg flex items-center gap-1 text-[10px] font-medium transition-all ${manageMode ? '' : 'hover:opacity-80'}`}
                style={{
                  background: manageMode ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)',
                  border: manageMode ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(255,255,255,0.08)',
                  color: manageMode ? '#A78BFA' : '#9CA3AF',
                }}
              >
                {manageMode ? (
                  <><X size={11} /> 取消</>
                ) : (
                  <><CheckSquare size={11} /> 管理</>
                )}
              </button>
            </div>

            {/* 管理模式：全选栏 */}
            {manageMode && (
              <button
                onClick={handleSelectAll}
                className="w-full mb-2 py-1.5 rounded-lg flex items-center justify-center gap-1.5 text-[11px] font-medium transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#9CA3AF',
                }}
              >
                {selectedIds.size === inProgressSessions.length ? '取消全选' : `全选 (${inProgressSessions.length})`}
              </button>
            )}

            <div className="space-y-2">
              {inProgressSessions.slice(0, manageMode ? undefined : 6).map((session) => (
                <WorkflowSessionCard
                  key={session.id}
                  session={session}
                  onResume={() => {
                    if (session.status === 'active') return;
                    fetch(`/api/workflow/sessions/${session.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: 'active' }),
                    }).catch(() => {});
                  }}
                  onDelete={handleDeleteOne}
                  manageMode={manageMode}
                  checked={selectedIds.has(session.id)}
                  onToggleSelect={handleToggleSelect}
                />
              ))}
            </div>

            {/* 管理模式：底部批量删除 */}
            {manageMode && selectedIds.size > 0 && (
              <button
                onClick={handleBatchDelete}
                disabled={deleting}
                className="w-full mt-2 py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold transition-all active:scale-95"
                style={{
                  background: 'rgba(239,68,68,0.15)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  color: '#FCA5A5',
                  opacity: deleting ? 0.5 : 1,
                }}
              >
                <Trash2 size={14} />
                {deleting ? '删除中...' : `删除选中 (${selectedIds.size})`}
              </button>
            )}
          </div>
        )}

        {/* ─── 2. 推荐方案 (主力入口) ─── */}
        {(recommendations.length > 0 || customCombos.length > 0 || !accountType) && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles size={14} color="#F9A8D4" />
                <p style={sectionLabel}>
                  {preset ? `${preset.label} · 推荐方案` : '推荐方案'}
                </p>
              </div>
              <button
                onClick={() => setShowAccountPicker(true)}
                className="text-[11px] flex items-center gap-0.5"
                style={{ color: '#93C5FD' }}
              >
                换账号 <ChevronRight size={12} />
              </button>
            </div>

            <div className="space-y-2">
              {recommendations.map((combo, ci) => (
                <GlassCard
                  key={combo.id}
                  hover
                  className="!p-3"
                  style={{
                    background: 'linear-gradient(135deg, rgba(244,114,182,0.04), rgba(139,92,246,0.04))',
                    border: ci === 0 && highlightFirstCombo
                      ? '1.5px solid rgba(244,114,182,0.5)' : '1px solid rgba(244,114,182,0.12)',
                    animation: ci === 0 && highlightFirstCombo
                      ? 'pulse-glow 2s ease-in-out infinite' : 'none',
                  }}
                >
                  {ci === 0 && (
                    <style>{`@keyframes pulse-glow { 0%,100% { box-shadow: 0 0 8px rgba(244,114,182,0.2); } 50% { box-shadow: 0 0 20px rgba(244,114,182,0.5); } }`}</style>
                  )}
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span style={{ fontSize: 24 }}>{combo.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 700 }}>
                          {combo.title}
                          {ci === 0 && highlightFirstCombo && (
                            <span style={{ color: '#F472B6', fontSize: 10, marginLeft: 6, fontWeight: 400 }}>👈 试试这个</span>
                          )}
                        </p>
                        <p style={{ color: '#6B7280', fontSize: 11, marginTop: 1, lineHeight: 1.4 }} className="line-clamp-1">
                          {combo.desc}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (highlightFirstCombo) {
                            localStorage.setItem('lingji_first_combo_highlight', 'done');
                            setHighlightFirstCombo(false);
                          }
                          handleStartCombo(combo);
                        }}
                        disabled={isCreating}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 shrink-0 active:scale-95"
                        style={{
                          background: 'linear-gradient(135deg, #F472B6, #8B5CF6)',
                          color: '#FFFFFF',
                          opacity: isCreating ? 0.6 : 1,
                        }}
                      >
                        {isCreating ? '...' : '开始'} <ArrowRight size={11} />
                      </button>
                    </div>
                    {/* Step flow preview */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {combo.steps.map((step, si) => (
                        <span key={si} className="inline-flex items-center gap-1">
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                            style={{
                              background: 'rgba(139,92,246,0.1)',
                              color: '#A78BFA',
                              border: '1px solid rgba(139,92,246,0.15)',
                            }}
                          >
                            {step.label}
                          </span>
                          {si < combo.steps.length - 1 && (
                            <span style={{ color: '#4B5563', fontSize: 9 }}>→</span>
                          )}
                        </span>
                      ))}
                      {/* Output type badge */}
                      {(() => {
                        const last = combo.steps[combo.steps.length - 1];
                        const typeMap: Record<string, { label: string; color: string }> = {
                          '/publish': { label: '多平台发布', color: '#F43F5E' },
                          '/ai/video': { label: '生成视频', color: '#06B6D4' },
                          '/ai/ads': { label: '生成9图', color: '#F59E0B' },
                          '/ai/image': { label: '生成图片', color: '#8B5CF6' },
                          '/ai/digital-human': { label: '生成视频', color: '#06B6D4' },
                          '/ai/copywriting': { label: '生成文案', color: '#3B82F6' },
                        };
                        const t = typeMap[last?.entry] || { label: '完成', color: '#6B7280' };
                        return (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-medium ml-1"
                            style={{ background: 'rgba(34,197,94,0.1)', color: '#4ADE80', border: '1px solid rgba(34,197,94,0.15)' }}
                          >
                            产出：{t.label}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </GlassCard>
              ))}

              {/* 自定义方案 */}
              {customCombos.map((combo) => (
                <GlassCard
                  key={combo.id}
                  hover
                  className="!p-3"
                  style={{
                    background: 'linear-gradient(135deg, rgba(168,85,247,0.04), rgba(139,92,246,0.04))',
                    border: '1px solid rgba(168,85,247,0.2)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span style={{ fontSize: 24 }}>{combo.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 700 }}>
                          {combo.title}
                        </p>
                        <span
                          className="px-1.5 py-0.5 rounded text-[9px]"
                          style={{ background: 'rgba(168,85,247,0.15)', color: '#A78BFA' }}
                        >
                          自定义
                        </span>
                      </div>
                      <p style={{ color: '#6B7280', fontSize: 11, marginTop: 1, lineHeight: 1.4 }} className="line-clamp-1">
                        {combo.desc}
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteCustomCombo(combo.id); }}
                      className="p-1 rounded-md"
                      title="删除"
                      style={{ background: 'rgba(239,68,68,0.08)' }}
                    >
                      <Trash2 size={11} color="#FCA5A5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStartCombo(combo); }}
                      disabled={isCreating}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 shrink-0 active:scale-95"
                      style={{
                        background: 'linear-gradient(135deg, #A78BFA, #8B5CF6)',
                        color: '#FFFFFF',
                        opacity: isCreating ? 0.6 : 1,
                      }}
                    >
                      {isCreating ? '...' : '开始'} <ArrowRight size={11} />
                    </button>
                  </div>
                </GlassCard>
              ))}
            </div>

            {/* 创建自定义方案入口 */}
            <button
              onClick={() => setShowCustomBuilder(true)}
              className="w-full mt-2 py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-medium border border-dashed transition-colors hover:border-white/20"
              style={{ borderColor: 'rgba(255,255,255,0.1)', color: '#6B7280' }}
            >
              <Wrench size={13} />
              创建自己的方案（自选工具组合）
            </button>
          </div>
        )}

        {/* ─── 方案 vs 工具 说明 ─── */}
        {(recommendations.length > 0 || customCombos.length > 0) && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)' }}
          >
            <span style={{ fontSize: 13 }}>💡</span>
            <p style={{ color: '#A78BFA', fontSize: 11, lineHeight: 1.5 }}>
              上方<strong>方案</strong>会<strong>自动串联多步</strong>，一键生成完整内容；
              下方<strong>工具</strong>适合<strong>手动单步创作</strong>，自由控制每个环节
            </p>
          </div>
        )}

        {/* ─── 3. AI 创作工具 ─── */}
        <div>
          <p style={{ ...sectionLabel, marginBottom: 8 }}>AI 创作工具</p>
          <div className="grid grid-cols-3 gap-2.5">
            {aiCreationTools.map(({ icon, title, desc, color, page, path, badge }) => (
              <GlassCard
                key={title}
                hover
                onClick={() => {
                  if (path) router.push(path);
                  else if (page) handleNavigate(page);
                }}
                className="!p-3 flex flex-col items-center text-center gap-1.5 relative overflow-hidden"
              >
                {badge && (
                  <span
                    className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold"
                    style={{ background: '#F59E0B', color: '#000' }}
                  >
                    {badge}
                  </span>
                )}
                <span style={{ color, fontSize: 28 }}>{icon}</span>
                <p style={{ color: '#FFFFFF', fontSize: 12, fontWeight: 600 }}>
                  <JargonTooltip text={title} />
                </p>
                <p style={{ color: '#6B7280', fontSize: 10, lineHeight: 1.3 }}>{desc}</p>
              </GlassCard>
            ))}
          </div>
        </div>

        {/* ─── 4. 效果数据 ─── */}
        <div>
          <p style={{ ...sectionLabel, marginBottom: 8 }}>效果数据</p>
          <div className="grid grid-cols-2 gap-2.5">
            {utilityTools.map(({ icon, title, desc, color, path }) => (
              <GlassCard
                key={title}
                hover
                onClick={() => path && router.push(path)}
                className="!p-3 flex items-center gap-3 relative overflow-hidden"
              >
                <span style={{ color, fontSize: 20 }}>{icon}</span>
                <div className="flex-1 min-w-0">
                  <p style={{ color: '#FFFFFF', fontSize: 12, fontWeight: 600 }}>{title}</p>
                  <p style={{ color: '#6B7280', fontSize: 10 }}>{desc}</p>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>

        {/* ─── 5. 最近作品 ─── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p style={sectionLabel}>最近作品</p>
            {aiWorks.length > 0 && (
              <button
                onClick={() => router.push('/inspiration?filter=AI作品')}
                className="flex items-center gap-0.5 text-[11px]"
                style={{ color: '#93C5FD' }}
              >
                全部 <ChevronRight size={12} />
              </button>
            )}
          </div>

          {loadingWorks ? (
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="aspect-[3/4] rounded-xl animate-pulse"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                />
              ))}
            </div>
          ) : aiWorks.length === 0 ? (
            <GlassCard
              hover
              onClick={() => handleNavigate('ai-copywriting')}
              style={{ cursor: 'pointer', background: 'linear-gradient(135deg, rgba(59,130,246,0.04), rgba(139,92,246,0.04))' }}
            >
              <div className="flex items-center gap-3 py-1.5">
                <span style={{ fontSize: 24 }}>✨</span>
                <div className="flex-1 min-w-0">
                  <p style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 600 }}>还没有 AI 作品</p>
                  <p style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>点击上方任意创作工具开始生成</p>
                </div>
                <ChevronRight size={16} color="#6B7280" />
              </div>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {aiWorks.map((item: any) => {
                const isVideo = item.type === 'video';
                const isImage = item.type === 'image';
                const thumb = item.thumbnail_url || item.media_urls?.[0];
                const typeEmoji = TYPE_EMOJIS[item.type] || '✨';
                const typeLabel = TYPE_LABELS[item.type] || item.type;
                return (
                  <button
                    key={item.id}
                    onClick={() => router.push(`/inspiration/detail?id=${item.id}`)}
                    className="relative rounded-xl overflow-hidden text-left transition-transform active:scale-95"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <div className="relative w-full" style={{ aspectRatio: '3/4' }}>
                      {isImage && thumb ? (
                        <img src={thumb} alt={item.title || ''} loading="lazy" className="w-full h-full object-cover" />
                      ) : isVideo && thumb ? (
                        <>
                          <video src={thumb} muted preload="metadata" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.25)' }}>
                            <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
                              <Play size={12} color="#FFFFFF" fill="#FFFFFF" style={{ marginLeft: 1 }} />
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span style={{ fontSize: 28 }}>{typeEmoji}</span>
                        </div>
                      )}
                      <span
                        className="absolute top-1 left-1 px-1 rounded text-[10px] font-medium"
                        style={{ background: 'rgba(0,0,0,0.6)', color: '#FFFFFF' }}
                      >
                        {typeLabel}
                      </span>
                      {item.type === 'voice' && (
                        <div className="absolute bottom-1 left-1">
                          <FileAudio size={12} color="#FFFFFF" />
                        </div>
                      )}
                    </div>
                    <p
                      className="px-1.5 py-1 line-clamp-1"
                      style={{ color: '#FFFFFF', fontSize: 10, fontWeight: 500 }}
                    >
                      {item.title || '未命名'}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

      </div>

      <BottomNav activePage="ai" onNavigate={handleNavigate} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <AccountTypeOnboarding open={showOnboarding} onClose={closeOnboarding} />
      {showAccountPicker && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          onClick={() => setShowAccountPicker(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-[448px] rounded-t-3xl p-5 pb-8 animate-slide-up max-h-[70vh] overflow-y-auto"
            style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <p style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 700 }}>选择账号类型</p>
                <p style={{ color: '#9CA3AF', fontSize: 11 }}>AI 创作中心会推荐对应视频组合</p>
              </div>
              <button
                onClick={() => setShowAccountPicker(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.08)' }}
              >
                <X size={14} color="#9CA3AF" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ACCOUNT_TYPE_PRESETS.map((p) => {
                const selected = p.id === accountType;
                const switching = switchingId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={async () => {
                      if (selected || switchingId) return;
                      setSwitchingId(p.id);
                      const result = await setAccountType(p.id);
                      setSwitchingId(null);
                      if (result.ok) {
                        setShowAccountPicker(false);
                        setToast({ message: `已切换到「${p.label}」，AI 创作中心推荐组合已更新`, type: 'success' });
                      } else {
                        setToast({ message: result.error || '切换失败', type: 'error' });
                      }
                    }}
                    disabled={!!switchingId}
                    className="text-left p-3 rounded-2xl transition-all active:scale-[0.98]"
                    style={{
                      background: selected
                        ? 'linear-gradient(135deg, rgba(244,114,182,0.18), rgba(139,92,246,0.18))'
                        : 'rgba(255,255,255,0.04)',
                      border: selected
                        ? '1px solid rgba(244,114,182,0.5)'
                        : '1px solid rgba(255,255,255,0.08)',
                      opacity: switchingId && !switching ? 0.5 : 1,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span style={{ fontSize: 20 }}>{p.emoji}</span>
                      <span style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>{p.label}</span>
                      {selected && !switching && (
                        <Check size={14} color="#F9A8D4" className="ml-auto" />
                      )}
                      {switching && (
                        <Loader2 size={14} color="#F9A8D4" className="ml-auto animate-spin" />
                      )}
                    </div>
                    <p style={{ color: '#9CA3AF', fontSize: 11, lineHeight: 1.4 }}>
                      {p.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {showCustomBuilder && (
        <CustomComboBuilder
          onSave={handleSaveCustomCombo}
          onClose={() => setShowCustomBuilder(false)}
        />
      )}
    </div>
  );
}

export default function AICreationPage() {
  return (
    <ProtectedRoute>
      <AICreationContent />
    </ProtectedRoute>
  );
}
