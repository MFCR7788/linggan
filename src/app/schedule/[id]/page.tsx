'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Calendar, Clock, MapPin, CheckCircle, XCircle, Trash2, ChevronLeft, ChevronRight,
  BookOpen, Lightbulb, ListChecks, Target, ExternalLink,
} from 'lucide-react';
import { GlassCard, GlassBadge } from '@/components/GlassCard';
import { TopNav } from '@/components/TopNav';
import { LoadingSpinner, EmptyState, ProtectedRoute } from '@/components';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import FormattedText from '@/components/FormattedText';
import { useSchedule, useUpdateSchedule, useDeleteSchedule } from '@/hooks/use-schedule';

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  pending: { bg: 'rgba(59,130,246,0.15)', text: '#93C5FD', border: '1px solid rgba(59,130,246,0.3)' },
  completed: { bg: 'rgba(16,185,129,0.15)', text: '#6EE7B7', border: '1px solid rgba(16,185,129,0.3)' },
  cancelled: { bg: 'rgba(239,68,68,0.15)', text: '#FCA5A5', border: '1px solid rgba(239,68,68,0.3)' },
};

const STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  completed: '已完成',
  cancelled: '已取消',
};

interface LinkedInspiration {
  id: string;
  title: string | null;
  original_text: string | null;
  ai_summary: string | null;
  ai_key_points: string[] | null;
  ai_creation_suggestions: string[] | null;
  type: string;
  created_at: string;
}

function ScheduleDetailContent() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { data: schedule, isLoading, isError } = useSchedule(id);
  const updateSchedule = useUpdateSchedule();
  const deleteSchedule = useDeleteSchedule();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleToggleStatus = async () => {
    if (!schedule) return;
    const newStatus = schedule.status === 'completed' ? 'pending' : 'completed';
    try {
      await updateSchedule.mutateAsync({ id, data: { status: newStatus } });
    } catch (error) {
      console.error('更新日程状态失败:', error);
    }
  };

  const handleCancel = async () => {
    if (!schedule) return;
    try {
      await updateSchedule.mutateAsync({ id, data: { status: 'cancelled' } });
    } catch (error) {
      console.error('取消日程失败:', error);
    }
  };

  const handleDelete = async () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    try {
      await deleteSchedule.mutateAsync(id);
      router.replace('/schedule');
    } catch (error) {
      console.error('删除日程失败:', error);
    }
    setShowDeleteConfirm(false);
  };

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    const dateStr = d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
    const timeStr = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    return { dateStr, timeStr };
  };

  const isPast = (iso: string) => new Date(iso) < new Date();

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen">
        <TopNav title="日程详情" showBack onBack={() => router.back()} />
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner text="加载日程..." />
        </div>
      </div>
    );
  }

  if (isError || !schedule) {
    return (
      <div className="flex flex-col min-h-screen">
        <TopNav title="日程详情" showBack onBack={() => router.back()} />
        <div className="flex-1 py-16">
          <EmptyState icon={<Calendar size={40} color="#9CA3AF" />} title="日程不存在" description="该日程可能已被删除" />
        </div>
      </div>
    );
  }

  const linkedInspiration = (schedule as any).linkedInspiration as LinkedInspiration | null;
  const relatedInspirations = ((schedule as any).relatedInspirations || []) as any[];
  const { dateStr, timeStr } = formatDateTime(schedule.scheduled_at);
  const past = isPast(schedule.scheduled_at) && schedule.status === 'pending';
  const style = STATUS_STYLES[schedule.status] || STATUS_STYLES.pending;

  return (
    <div className="flex flex-col min-h-screen pb-6">
      <TopNav title="日程详情" showBack onBack={() => router.back()} />

      <div className="flex-1 px-4 pt-4 space-y-4">
        {/* ─── 日程基本信息 ─────────────────────────────── */}
        <GlassCard className="!p-5">
          {/* 标题 + 状态 */}
          <div className="flex items-start justify-between mb-4">
            <h1
              className="flex-1 pr-4"
              style={{
                color: '#FFFFFF',
                fontSize: 20,
                fontWeight: 700,
                lineHeight: 1.4,
                textDecoration: schedule.status === 'completed' ? 'line-through' : 'none',
                opacity: schedule.status === 'completed' ? 0.6 : 1,
              }}
            >
              {schedule.title}
            </h1>
            <span
              className="px-3 py-1 rounded-full text-xs flex-shrink-0"
              style={style}
            >
              {STATUS_LABELS[schedule.status] || schedule.status}
            </span>
          </div>

          {/* 日期时间 */}
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background: `${schedule.color || '#3B82F6'}22`,
                border: `1px solid ${schedule.color || '#3B82F6'}44`,
              }}
            >
              <Calendar size={18} style={{ color: schedule.color || '#3B82F6' }} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <Clock size={13} color={past ? '#EF4444' : '#9CA3AF'} />
                <span style={{ color: past ? '#EF4444' : '#E5E7EB', fontSize: 14, fontWeight: 500 }}>
                  {dateStr}
                </span>
                <span style={{ color: '#9CA3AF', fontSize: 14 }}>{timeStr}</span>
              </div>
              {past && <span style={{ color: '#EF4444', fontSize: 11 }}>已过期</span>}
            </div>
          </div>

          {/* 地点 */}
          {schedule.location && (
            <div className="flex items-center gap-2 mb-3 mt-2">
              <MapPin size={14} color="#9CA3AF" />
              <span style={{ color: '#D1D5DB', fontSize: 13 }}>{schedule.location}</span>
            </div>
          )}

          {/* 创建时间 */}
          <p style={{ color: '#6B7280', fontSize: 11 }}>
            创建于 {new Date(schedule.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </GlassCard>

        {/* ─── 日程描述 ──────────────────────────────────── */}
        {schedule.description && (
          <GlassCard className="!p-4">
            <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 6 }}>描述</p>
            <FormattedText text={schedule.description} color="#E5E7EB" fontSize={13} lineHeight={1.7} />
          </GlassCard>
        )}

        {/* ─── AI 分析内容（来源灵感） ────────────────────── */}
        {linkedInspiration && (
          <>
            <div className="flex items-center gap-2 px-1">
              <BookOpen size={14} color="#3B82F6" />
              <span style={{ color: '#93C5FD', fontSize: 13, fontWeight: 600 }}>AI 分析内容</span>
            </div>

            {/* 核心任务 */}
            {linkedInspiration.ai_summary && (
              <GlassCard className="!p-4" style={{ border: '1px solid rgba(59,130,246,0.4)', background: 'rgba(59,130,246,0.06)' } as React.CSSProperties}>
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center"
                    style={{ background: '#3B82F6', color: '#fff', fontSize: 10, fontWeight: 700 }}
                  >AI</div>
                  <div className="flex items-center gap-1.5">
                    <Target size={14} color="#FBBF24" />
                    <span style={{ color: '#FBBF24', fontSize: 13, fontWeight: 600 }}>核心任务</span>
                  </div>
                </div>
                <FormattedText text={linkedInspiration.ai_summary || ""} color="#E5E7EB" fontSize={13} lineHeight={1.7} />
              </GlassCard>
            )}

            {/* 任务清单 */}
            {linkedInspiration.ai_key_points && linkedInspiration.ai_key_points.length > 0 && (
              <GlassCard className="!p-4">
                <div className="flex items-center gap-2 mb-3">
                  <ListChecks size={16} color="#22C55E" />
                  <span style={{ color: '#22C55E', fontSize: 13, fontWeight: 600 }}>任务清单</span>
                </div>
                <div className="space-y-2">
                  {linkedInspiration.ai_key_points.map((point: string, idx: number) => (
                    <div key={idx} className="flex items-start gap-2">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}
                      >
                        <span style={{ color: '#22C55E', fontSize: 10, fontWeight: 700 }}>{idx + 1}</span>
                      </div>
                      <span style={{ color: '#D1D5DB', fontSize: 13, lineHeight: 1.5 }}>{point}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}

            {/* 备选方案 */}
            {linkedInspiration.ai_creation_suggestions && linkedInspiration.ai_creation_suggestions.length > 0 && (
              <GlassCard className="!p-4" style={{ border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.04)' } as React.CSSProperties}>
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb size={16} color="#A78BFA" />
                  <span style={{ color: '#A78BFA', fontSize: 13, fontWeight: 600 }}>备选方案</span>
                </div>
                <div className="space-y-2">
                  {linkedInspiration.ai_creation_suggestions.map((suggestion: string, idx: number) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span style={{ color: '#A78BFA', fontSize: 14, flexShrink: 0 }}>💡</span>
                      <span style={{ color: '#D1D5DB', fontSize: 13, lineHeight: 1.5 }}>{suggestion}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}

            {/* 原始内容 */}
            {linkedInspiration.original_text && (
              <GlassCard className="!p-4">
                <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 6 }}>原始内容</p>
                <FormattedText text={linkedInspiration.original_text || ""} color="#D1D5DB" fontSize={12} lineHeight={1.6} />
              </GlassCard>
            )}

            {/* 跳转到灵感详情 */}
            <button
              onClick={() => router.push(`/inspiration/detail?id=${linkedInspiration.id}`)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm transition-all"
              style={{
                background: 'rgba(59,130,246,0.1)',
                border: '1px solid rgba(59,130,246,0.25)',
                color: '#93C5FD',
              }}
            >
              <BookOpen size={14} />
              查看原始灵感详情
              <ExternalLink size={12} />
            </button>
          </>
        )}

        {/* ─── 关联灵感推荐 ──────────────────────────── */}
        {relatedInspirations.length > 0 && (
          <>
            <div className="flex items-center gap-2 px-1 mt-2">
              <Lightbulb size={14} color="#FBBF24" />
              <span style={{ color: '#FBBF24', fontSize: 13, fontWeight: 600 }}>相关灵感</span>
              <span style={{ color: '#6B7280', fontSize: 11 }}>({relatedInspirations.length})</span>
            </div>
            <div className="space-y-2">
              {relatedInspirations.map((item: any) => (
                <div
                  key={item.id}
                  onClick={() => router.push(`/inspiration/detail?id=${item.id}`)}
                  className="rounded-xl p-3 transition-all cursor-pointer hover:bg-white/5"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-xs flex-shrink-0">
                        {item.type === 'image' ? '🖼' : item.type === 'video' ? '🎬' : item.type === 'audio' ? '🎵' : '💡'}
                      </span>
                      <span
                        className="truncate text-sm"
                        style={{ color: '#E5E7EB' }}
                      >
                        {item.title || item.ai_summary?.slice(0, 50) || '未命名灵感'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      {item.estimated_duration && (
                        <span style={{ color: '#9CA3AF', fontSize: 11 }}>
                          {item.estimated_duration}分钟
                        </span>
                      )}
                      {item.lifecycle && item.lifecycle !== 'seed' && (
                        <span
                          className="px-1.5 py-0.5 rounded-full text-xs"
                          style={{
                            background: item.lifecycle === 'bloom' ? 'rgba(16,185,129,0.15)' :
                                         item.lifecycle === 'growing' ? 'rgba(59,130,246,0.15)' :
                                         'rgba(168,85,247,0.15)',
                            color: item.lifecycle === 'bloom' ? '#6EE7B7' :
                                    item.lifecycle === 'growing' ? '#93C5FD' : '#A78BFA',
                          }}
                        >
                          {item.lifecycle === 'bloom' ? '成熟' : item.lifecycle === 'growing' ? '成长' : '萌芽'}
                        </span>
                      )}
                      <ChevronRight size={14} color="#6B7280" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ─── 没有关联灵感时的提示 ──────────────────────── */}
        {!linkedInspiration && !schedule.description && (
          <GlassCard className="!p-6">
            <div className="flex flex-col items-center gap-3">
              <BookOpen size={32} color="#6B7280" />
              <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center' }}>
                此日程暂无详细信息
              </p>
              <p style={{ color: '#6B7280', fontSize: 11, textAlign: 'center' }}>
                通过 AI 助手创建的日程会自动包含分析内容
              </p>
            </div>
          </GlassCard>
        )}

        {/* ─── 操作按钮 ──────────────────────────────────── */}
        <div className="flex gap-3">
          <button
            onClick={handleToggleStatus}
            disabled={updateSchedule.isPending}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all"
            style={{
              background: schedule.status === 'completed'
                ? 'rgba(251,191,36,0.12)'
                : 'rgba(16,185,129,0.12)',
              border: `1px solid ${
                schedule.status === 'completed'
                  ? 'rgba(251,191,36,0.3)'
                  : 'rgba(16,185,129,0.3)'
              }`,
              color: schedule.status === 'completed' ? '#FBBF24' : '#6EE7B7',
              opacity: updateSchedule.isPending ? 0.6 : 1,
            }}
          >
            <CheckCircle size={16} />
            {schedule.status === 'completed' ? '重新打开' : '标记完成'}
          </button>
          {schedule.status !== 'cancelled' && schedule.status !== 'completed' && (
            <button
              onClick={handleCancel}
              disabled={updateSchedule.isPending}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium"
              style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.2)',
                color: '#FCA5A5',
              }}
            >
              <XCircle size={16} />
              取消日程
            </button>
          )}
          <button
            onClick={handleDelete}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#9CA3AF',
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="删除日程"
        message="确定要删除这个日程吗？"
        confirmLabel="删除"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

export default function ScheduleDetailPage() {
  return (
    <ProtectedRoute>
      <ScheduleDetailContent />
    </ProtectedRoute>
  );
}
