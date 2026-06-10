'use client';

// Agent 对话助手页面 — 小白友好对话框 + Agent 多轮模式

import { ProtectedRoute } from '@/components';
import { AgentChatView } from '@/components/agent/AgentChatView';

export default function AgentPage() {
  return (
    <ProtectedRoute>
      <div className="flex flex-col h-screen bg-[#0A1629]">
        <AgentChatView />
      </div>
    </ProtectedRoute>
  );
}
