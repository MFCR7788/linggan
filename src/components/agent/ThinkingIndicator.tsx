'use client';

// 思考指示器 — 显示 Agent 思考状态 + 工具执行

interface ThinkingIndicatorProps {
  status: 'thinking' | 'executing';
  toolName?: string;
  message?: string;
}

export function ThinkingIndicator({ status, toolName, message }: ThinkingIndicatorProps) {
  const toolLabel = toolName ? TOOL_LABELS[toolName] || toolName : '';

  return (
    <div className="flex items-center gap-2 px-4 py-2 mb-2">
      {/* 脉冲圆点 */}
      <div className="relative flex items-center justify-center w-3 h-3">
        <div
          className={`absolute inset-0 rounded-full animate-ping ${
            status === 'executing' ? 'bg-yellow-400/50' : 'bg-blue-400/50'
          }`}
        />
        <div
          className={`w-2 h-2 rounded-full ${
            status === 'executing' ? 'bg-yellow-400' : 'bg-blue-400'
          }`}
        />
      </div>

      {/* 状态文字 */}
      <span className="text-xs text-white/50">
        {message || (status === 'executing' ? `正在${toolLabel}...` : '思考中...')}
      </span>
    </div>
  );
}

const TOOL_LABELS: Record<string, string> = {
  web_search: '搜索网络',
  generate_image: '生成图片',
  generate_video: '提交视频任务',
  get_weather: '查询天气',
  analyze_image: '分析图片',
  read_document: '读取文档',
  search_memory: '搜索记忆',
  search_knowledge: '搜索知识库',
  search_inspirations: '搜索灵感',
  get_hotspot: '获取热点',
  summarize: '总结内容',
  synthesize_speech: '语音合成',
};
