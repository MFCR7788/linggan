"use client";


import { useState } from "react";
import { Calendar, Clock, MapPin, CheckCircle, XCircle, ChevronRight, Trash2, Plus, X } from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { BottomNav, PageKey } from "@/components/BottomNav";
import { LoadingSpinner, EmptyState, ProtectedRoute } from "@/components";
import { useRouter } from "next/navigation";
import { useSchedules, useUpdateSchedule, useDeleteSchedule, useCreateSchedule } from "@/hooks/use-schedule";
import { useNotificationScheduler } from "@/hooks/use-notification-scheduler";
import { PAGE_ROUTES } from "@/lib/style-constants";
import type { Schedule } from "@/types";

const STATUS_FILTERS = [
  { key: "", label: "全部" },
  { key: "pending", label: "待处理" },
  { key: "completed", label: "已完成" },
  { key: "cancelled", label: "已取消" },
];

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  pending: { bg: "rgba(59,130,246,0.15)", text: "#93C5FD", border: "1px solid rgba(59,130,246,0.3)" },
  completed: { bg: "rgba(16,185,129,0.15)", text: "#6EE7B7", border: "1px solid rgba(16,185,129,0.3)" },
  cancelled: { bg: "rgba(239,68,68,0.15)", text: "#FCA5A5", border: "1px solid rgba(239,68,68,0.3)" },
};

const STATUS_LABELS: Record<string, string> = {
  pending: "待处理",
  completed: "已完成",
  cancelled: "已取消",
};

function ScheduleContent() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState("");
  const { data: schedules, isLoading } = useSchedules({ status: activeFilter || undefined });
  useNotificationScheduler();
  const updateSchedule = useUpdateSchedule();
  const deleteSchedule = useDeleteSchedule();
  const createSchedule = useCreateSchedule();
  const [showCreate, setShowCreate] = useState(false);
  const [newSchedule, setNewSchedule] = useState({ title: "", description: "", scheduled_at: "", location: "" });

  const handleCreate = async () => {
    if (!newSchedule.title.trim() || !newSchedule.scheduled_at) return;
    try {
      await createSchedule.mutateAsync({
        title: newSchedule.title.trim(),
        description: newSchedule.description.trim() || undefined,
        scheduled_at: new Date(newSchedule.scheduled_at).toISOString(),
        location: newSchedule.location.trim() || undefined,
      });
      setShowCreate(false);
      setNewSchedule({ title: "", description: "", scheduled_at: "", location: "" });
    } catch (e) {
      console.error('创建日程失败:', e);
    }
  };

  const handleNavigate = (page: PageKey) => {
    router.push(PAGE_ROUTES[page] || "/home");
  };

  const handleToggleStatus = async (item: Schedule) => {
    const newStatus = item.status === 'completed' ? 'pending' : 'completed';
    try {
      await updateSchedule.mutateAsync({ id: item.id, data: { status: newStatus } });
    } catch (error) {
      console.error('更新日程状态失败:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个日程吗？')) return;
    try {
      await deleteSchedule.mutateAsync(id);
    } catch (error) {
      console.error('删除日程失败:', error);
    }
  };

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    const dateStr = d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
    const timeStr = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    return { dateStr, timeStr };
  };

  const isPast = (iso: string) => new Date(iso) < new Date();

  return (
    <div className="flex flex-col min-h-screen">
      <TopNav
        title="日程管理"
        showBack
        onBack={() => router.push("/home")}
      />

      <div className="flex-1 px-4 pt-4 pb-24">
        {/* 状态筛选 */}
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {STATUS_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              className="px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-all"
              style={{
                background: activeFilter === key ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.07)',
                border: activeFilter === key ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.1)',
                color: activeFilter === key ? '#93C5FD' : '#9CA3AF',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 日程列表 */}
        {isLoading ? (
          <div className="py-12">
            <LoadingSpinner text="加载日程..." />
          </div>
        ) : !schedules || schedules.length === 0 ? (
          <EmptyState
            icon={<Calendar size={40} color="#9CA3AF" />}
            title="暂无日程"
            description="在灵感助手中输入日程相关内容，保存为日程"
          />
        ) : (
          <div className="space-y-3">
            {schedules.map((item) => {
              const { dateStr, timeStr } = formatDateTime(item.scheduled_at);
              const past = isPast(item.scheduled_at) && item.status === 'pending';
              const style = STATUS_STYLES[item.status] || STATUS_STYLES.pending;

              return (
                <div
                  key={item.id}
                  onClick={() => router.push(`/schedule/${item.id}`)}
                  className="rounded-xl p-4 transition-all cursor-pointer hover:bg-white/5"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    opacity: item.status === 'cancelled' ? 0.5 : 1,
                  }}
                >
                  <div className="flex items-start gap-3">
                    {/* 日期标识 */}
                    <div
                      className="flex-shrink-0 w-12 h-12 rounded-xl flex flex-col items-center justify-center"
                      style={{
                        background: `${item.color || '#3B82F6'}22`,
                        border: `1px solid ${item.color || '#3B82F6'}44`,
                      }}
                    >
                      <span style={{ color: item.color || '#3B82F6', fontSize: 11, fontWeight: 600 }}>
                        {new Date(item.scheduled_at).getDate()}
                      </span>
                      <span style={{ color: item.color || '#3B82F6', fontSize: 9, opacity: 0.7 }}>
                        {new Date(item.scheduled_at).toLocaleDateString('zh-CN', { month: 'short' })}
                      </span>
                    </div>

                    {/* 内容 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 style={{
                          color: '#FFFFFF',
                          fontSize: 15,
                          fontWeight: 600,
                          textDecoration: item.status === 'completed' ? 'line-through' : 'none',
                          opacity: item.status === 'completed' ? 0.6 : 1,
                        }} className="truncate">
                          {item.title}
                        </h3>
                        <span
                          className="px-2 py-0.5 rounded-full text-xs ml-2 flex-shrink-0"
                          style={style}
                        >
                          {STATUS_LABELS[item.status] || item.status}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                        <div className="flex items-center gap-1">
                          <Clock size={12} color="#9CA3AF" />
                          <span style={{ color: past ? '#EF4444' : '#9CA3AF', fontSize: 12 }}>
                            {past ? '已过期 ' : ''}{dateStr} {timeStr}
                          </span>
                        </div>
                        {item.location && (
                          <div className="flex items-center gap-1">
                            <MapPin size={12} color="#9CA3AF" />
                            <span style={{ color: '#9CA3AF', fontSize: 12 }}>{item.location}</span>
                          </div>
                        )}
                      </div>

                      {item.description && (
                        <p style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }} className="line-clamp-2">
                          {item.description}
                        </p>
                      )}

                      {/* 操作按钮 */}
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleStatus(item); }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-all hover:bg-white/10"
                          style={{
                            background: item.status === 'completed'
                              ? 'rgba(16,185,129,0.15)'
                              : 'rgba(255,255,255,0.06)',
                            border: `1px solid ${
                              item.status === 'completed'
                                ? 'rgba(16,185,129,0.3)'
                                : 'rgba(255,255,255,0.1)'
                            }`,
                            color: item.status === 'completed' ? '#6EE7B7' : '#9CA3AF',
                          }}
                        >
                          <CheckCircle size={12} />
                          {item.status === 'completed' ? '已完成' : '标记完成'}
                        </button>
                        {item.status !== 'cancelled' && item.status !== 'completed' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); updateSchedule.mutateAsync({ id: item.id, data: { status: 'cancelled' } }); }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-all hover:bg-white/10"
                            style={{
                              background: 'rgba(239,68,68,0.1)',
                              border: '1px solid rgba(239,68,68,0.2)',
                              color: '#FCA5A5',
                            }}
                          >
                            <XCircle size={12} />
                            取消
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-all hover:bg-white/10 ml-auto"
                          style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: '#9CA3AF',
                          }}
                        >
                          <Trash2 size={12} />
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 创建日程 FAB */}
      <button
        onClick={() => setShowCreate(true)}
        className="fixed bottom-20 right-5 w-12 h-12 rounded-full flex items-center justify-center shadow-lg z-20 transition-transform active:scale-90"
        style={{ background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)' }}
      >
        <Plus size={24} color="#FFFFFF" />
      </button>

      {/* 创建日程弹窗 */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShowCreate(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{
              background: 'rgba(30,41,59,0.95)',
              border: '1px solid rgba(255,255,255,0.1)',
              backdropFilter: 'blur(16px)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 700 }}>新建日程</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded-full hover:bg-white/10">
                <X size={20} color="#9CA3AF" />
              </button>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                placeholder="日程标题"
                value={newSchedule.title}
                onChange={e => setNewSchedule(prev => ({ ...prev, title: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              <input
                type="text"
                placeholder="描述（可选）"
                value={newSchedule.description}
                onChange={e => setNewSchedule(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              <input
                type="datetime-local"
                value={newSchedule.scheduled_at}
                onChange={e => setNewSchedule(prev => ({ ...prev, scheduled_at: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)', colorScheme: 'dark' }}
              />
              <input
                type="text"
                placeholder="地点（可选）"
                value={newSchedule.location}
                onChange={e => setNewSchedule(prev => ({ ...prev, location: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#E5E7EB', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>

            <button
              onClick={handleCreate}
              disabled={!newSchedule.title.trim() || !newSchedule.scheduled_at || createSchedule.isPending}
              className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: !newSchedule.title.trim() || !newSchedule.scheduled_at
                  ? 'rgba(59,130,246,0.3)'
                  : 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
                color: !newSchedule.title.trim() || !newSchedule.scheduled_at ? '#6B7280' : '#FFFFFF',
              }}
            >
              {createSchedule.isPending ? '创建中...' : '创建日程'}
            </button>
          </div>
        </div>
      )}

      <BottomNav
        activePage="home"
        onNavigate={handleNavigate}
      />
    </div>
  );
}

export default function SchedulePage() {
  return (
    <ProtectedRoute>
      <ScheduleContent />
    </ProtectedRoute>
  );
}
