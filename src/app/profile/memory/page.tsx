'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Brain, Search, Filter, X } from 'lucide-react';
import { ProtectedRoute } from '@/components';
import { TopNav } from '@/components/TopNav';
import { BottomNav, PageKey } from '@/components/BottomNav';
import { GlassCard } from '@/components/GlassCard';
import { LoadingSpinner } from '@/components/loading-spinner';
import { ErrorState } from '@/components/error-state';
import { EmptyState } from '@/components/empty-state';
import { useToast } from '@/components/Toast';
import { useMemories, useDeleteMemory } from '@/hooks/use-memory';
import type { MemoryEntry, MemorySearchResult } from '@/lib/assistant/types';

const CATEGORIES = [
  { value: '', label: '全部', icon: '📋' },
  { value: 'profile', label: '个人信息', icon: '👤' },
  { value: 'preference', label: '偏好', icon: '⭐' },
  { value: 'fact', label: '事实', icon: '📌' },
  { value: 'workflow', label: '工作流', icon: '🔄' },
  { value: 'general', label: '通用', icon: '📝' },
];

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 60000) return '刚刚';
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}分钟前`;
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}小时前`;
  return `${Math.floor(diffMs / 86400000)}天前`;
}

function isMemoryEntry(item: MemoryEntry | MemorySearchResult): item is MemoryEntry {
  return 'userId' in item;
}

function MemoryContent() {
  const router = useRouter();
  const { showToast } = useToast();
  const [category, setCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const { data: memories, isLoading, error, refetch } = useMemories({
    category: category || undefined,
    query: searchQuery || undefined,
  });

  const deleteMemory = useDeleteMemory();

  const handleSearch = () => {
    setSearchQuery(searchInput.trim());
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setSearchQuery('');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这条记忆吗？')) return;
    try {
      await deleteMemory.mutateAsync(id);
      showToast('已删除', 'success');
    } catch {
      showToast('删除失败', 'error');
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

  return (
    <div className="flex flex-col min-h-screen pb-20">
      <TopNav title="AI 记忆" showBack onBack={() => router.push('/profile')} />

      <div className="flex-1 px-4 pt-4 space-y-4">
        {/* 说明卡片 */}
        <GlassCard className="!p-4">
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(167,139,250,0.2)', border: '1px solid rgba(167,139,250,0.3)' }}
            >
              <Brain size={20} color="#A78BFA" />
            </div>
            <div>
              <p style={{ color: '#E5E7EB', fontSize: 14, fontWeight: 600 }}>AI 对你的理解</p>
              <p style={{ color: '#9CA3AF', fontSize: 12 }} className="mt-1">
                AI 合伙人会在对话中自动提取关于你的重要信息并保存。这里可以查看和管理这些记忆。
              </p>
            </div>
          </div>
        </GlassCard>

        {/* 搜索框 */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search size={14} color="#6B7280" className="absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="搜索记忆..."
              className="w-full pl-9 pr-8 py-2 rounded-xl text-sm outline-none"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#E5E7EB',
              }}
            />
            {searchInput && (
              <button
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5"
              >
                <X size={14} color="#6B7280" />
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            className="px-3 py-2 rounded-xl text-sm"
            style={{ background: 'rgba(59,130,246,0.15)', color: '#93C5FD' }}
          >
            搜索
          </button>
        </div>

        {/* 分类筛选 */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map(c => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1"
              style={{
                background: category === c.value ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)',
                border: category === c.value ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.08)',
                color: category === c.value ? '#93C5FD' : '#9CA3AF',
              }}
            >
              <span>{c.icon}</span> {c.label}
            </button>
          ))}
        </div>

        {/* 记忆列表 */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <LoadingSpinner text="加载记忆..." />
          </div>
        ) : error ? (
          <ErrorState message="加载失败" onRetry={() => refetch()} />
        ) : !memories?.length ? (
          <EmptyState
            icon={<Brain size={40} color="#6B7280" />}
            title={searchQuery ? '没有匹配的记忆' : '暂无记忆'}
            description={searchQuery ? '尝试其他搜索词' : '与 AI 合伙人对话后，它会自动提取有关你的记忆'}
          />
        ) : (
          <div className="space-y-2">
            {memories.map(item => {
              const cat = CATEGORIES.find(c => c.value === item.category);
              if (isMemoryEntry(item)) {
                const mem = item as MemoryEntry;
                return (
                  <GlassCard key={mem.id} className="!p-3">
                    <div className="flex items-start gap-3">
                      <span className="text-lg flex-shrink-0 mt-0.5">{cat?.icon || '📝'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span style={{ color: '#9CA3AF', fontSize: 10 }}>{cat?.label || mem.category}</span>
                          <span style={{ color: '#4B5563', fontSize: 10 }}>{formatTime(mem.createdAt)}</span>
                        </div>
                        <p style={{ color: '#E5E7EB', fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word' }}>
                          {mem.value}
                        </p>
                        {mem.key && (
                          <p style={{ color: '#6B7280', fontSize: 10 }} className="mt-1">{mem.key}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleDelete(mem.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 flex-shrink-0 transition-colors"
                      >
                        <Trash2 size={14} color="#EF4444" />
                      </button>
                    </div>
                  </GlassCard>
                );
              } else {
                // MemorySearchResult (similarity-based)
                const sr = item as MemorySearchResult;
                return (
                  <GlassCard key={sr.id} className="!p-3">
                    <div className="flex items-start gap-3">
                      <span className="text-lg flex-shrink-0 mt-0.5">{cat?.icon || '📝'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span style={{ color: '#9CA3AF', fontSize: 10 }}>{cat?.label || sr.category}</span>
                          <span
                            className="px-1 py-0.5 rounded text-[9px]"
                            style={{ background: 'rgba(59,130,246,0.1)', color: '#93C5FD' }}
                          >
                            相似度 {Math.round(sr.similarity * 100)}%
                          </span>
                        </div>
                        <p style={{ color: '#E5E7EB', fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word' }}>
                          {sr.value}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDelete(sr.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 flex-shrink-0 transition-colors"
                      >
                        <Trash2 size={14} color="#EF4444" />
                      </button>
                    </div>
                  </GlassCard>
                );
              }
            })}
          </div>
        )}
      </div>

      <BottomNav activePage="profile" onNavigate={handleNavigate} />
    </div>
  );
}

export default function MemoryPage() {
  return (
    <ProtectedRoute>
      <MemoryContent />
    </ProtectedRoute>
  );
}
