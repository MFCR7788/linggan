'use client';

// Agent 聊天主容器 — 会话管理 + 流式消息 + 语音 + 附件 + 媒体预览

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useInputHistory } from '@/hooks/use-input-history';
import { AgentMessage } from './AgentMessage';
import { ThinkingIndicator } from './ThinkingIndicator';
import { useSkillRecommendations, SkillRecommendCards, type SkillRecommendation } from './SkillRecommendCards';
import { CapabilityTags } from './CapabilityTags';
import { ChoiceCards, type ChoiceSelection } from './ChoiceCards';
import { InspirationPicker } from './InspirationPicker';
import { EditPlanCard } from './EditPlanCard';
import type { EditPlan } from '@/lib/agent/types';
import { parseChoices, type ChoiceOption } from '@/lib/agent/choice-parser';
import { parseParamCards, formatParamValues } from '@/lib/agent/param-parser';
import { ParamCard } from '@/components/agent/ParamCard';
import { AgentSSEClient } from '@/lib/agent/sse-client';
import { useVoiceRecording, formatTime } from '@/hooks/use-voice-recording';
import { useFileUpload } from '@/hooks/use-file-upload';
import { useAgentSessions } from '@/hooks/use-agent-sessions';
import type { AttachedFile } from '@/hooks/use-file-upload';
import type { AgentSession } from '@/hooks/use-agent-sessions';
import { ACCOUNT_TYPE_PRESETS, type RecommendationCombo, type AccountTypePreset } from '@/lib/account-presets';
import { scheduleNotification } from '@/lib/notification-service';
import { CREDIT_COSTS } from '@/lib/credit-costs';

// 生成类关键词 → 预估扣点（供前端确认弹窗用）
const GEN_COST_HINTS: { pattern: RegExp; cost: () => number; label: string }[] = [
  { pattern: /生成.*(?:图片|照片|图|配图|封面|海报|插图)/, cost: () => CREDIT_COSTS.ai_image.perImage, label: 'AI 图片生成' },
  { pattern: /(?:生成|做|创建).*(?:视频|短片|动画|影片)/, cost: () => CREDIT_COSTS.ai_video.premium, label: 'AI 视频生成' },
  { pattern: /数字人/, cost: () => CREDIT_COSTS.ai_digital_human['720P'], label: 'AI 数字人生成' },
  { pattern: /(?:配音|语音合成|文字转语音|TTS)/, cost: () => CREDIT_COSTS.ai_tts.minCost, label: 'AI 配音' },
];

function detectGenCost(input: string): { cost: number; label: string } | null {
  for (const hint of GEN_COST_HINTS) {
    if (hint.pattern.test(input)) return { cost: hint.cost(), label: hint.label };
  }
  return null;
}

// 工具名 → 流程步骤入口 映射（用于自动推进步骤）
const TOOL_TO_ENTRY: Record<string, string> = {
  search_inspirations: '/inspiration',
  save_to_inspiration: '/inspiration',
  generate_copywriting: '/ai/copywriting',
  summarize: '/ai/copywriting',
  search_knowledge: '/ai/copywriting',
  search_memory: '/ai/copywriting',
  generate_image: '/ai/image',
  edit_image: '/ai/image-editor',
  generate_grid_images: '/ai/ads',
  generate_digital_human: '/ai/digital-human',
  generate_video: '/ai/video',
  synthesize_speech: '/ai/tts',
  get_hotspot: '/hotspot',
  publish_content: '/publish',
};

interface UIMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  toolCalls: ToolCallRecord[];
  attachments?: { url: string; name: string; type: 'image' | 'video' | 'document' | 'audio' }[];
  generatedImages?: string[];
  generatedVideo?: { taskId: string; status: string; videoUrl?: string };
  generatedAudio?: string;
  schedules?: ScheduleItem[];
  editPlan?: EditPlan;
  timestamp: Date;
}

interface ScheduleItem {
  title: string;
  scheduled_at: string;
  description?: string;
  location?: string;
  suggestions?: string[];
}

interface ToolCallRecord {
  tool: string;
  params: Record<string, unknown>;
  result?: { success: boolean; output: string; data?: unknown; error?: string };
}

export function AgentChatView() {
  const router = useRouter();
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [currentTool, setCurrentTool] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [showTools, setShowTools] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice');

  // 检测语音识别是否可用
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      setInputMode('text');
    } else {
      // WKWebView 中 SpeechRecognition 可能存在但不工作
      try {
        const test = new SpeechRecognition();
        if (!test || typeof test.start !== 'function') {
          setSpeechSupported(false);
          setInputMode('text');
        }
      } catch {
        setSpeechSupported(false);
        setInputMode('text');
      }
    }
  }, []);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [choiceSubmitting, setChoiceSubmitting] = useState(false);
  const [choiceSelections, setChoiceSelections] = useState<Map<number, ChoiceSelection>>(new Map());
  const [paramValues, setParamValues] = useState<Map<number, Record<string, unknown>>>(new Map());
  const [paramSubmitting, setParamSubmitting] = useState(false);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [scheduledItems, setScheduledItems] = useState<Set<string>>(new Set());
  const [schedulingId, setSchedulingId] = useState<string | null>(null);

  // 账号类型选择 + 流程引导
  const [selectedAccountType, setSelectedAccountType] = useState<AccountTypePreset | null>(null);
  const [activeFlow, setActiveFlow] = useState<{ combo: RecommendationCombo; currentStep: number } | null>(null);
  const [accountSearch, setAccountSearch] = useState('');
  const [planProgress, setPlanProgress] = useState<{ goal: string; totalSteps: number; completedSteps: number; currentStep: string | null } | null>(null);

  // 素材选择器
  const [inspPickerOpen, setInspPickerOpen] = useState(false);
  const [inspPickerMediaType, setInspPickerMediaType] = useState<'image' | 'video'>('image');

  // 斜杠指令
  const [slashMenu, setSlashMenu] = useState<{ show: boolean; filter: string; index: number; pos: number }>({
    show: false, filter: '', index: 0, pos: 0,
  });

  const OFFICIAL_COMMANDS = [
    { command: '/xiaohongshu', label: '小红书文案优化', desc: '高互动率标题和正文', cat: 'writing' },
    { command: '/douyin', label: '抖音脚本创作', desc: '3秒钩子和口播脚本', cat: 'social' },
    { command: '/wechat', label: '公众号排版助手', desc: '排版和阅读体验优化', cat: 'writing' },
    { command: '/seo', label: 'SEO 标题生成', desc: '搜索友好标题策略', cat: 'writing' },
    { command: '/remix', label: '多平台改写', desc: '一稿多平台适配', cat: 'social' },
    { command: '/hotspot', label: '热点追踪分析', desc: '事件脉络和创作角度', cat: 'analysis' },
    { command: '/draw', label: 'AI 绘画提示词', desc: '5层 prompt 结构', cat: 'image' },
    { command: '/storyboard', label: '视频分镜脚本', desc: '分镜表和拍摄法则', cat: 'video' },
  ];

  const filteredCommands = (() => {
    if (!slashMenu.show) return [];
    const f = slashMenu.filter.toLowerCase();
    if (!f) return OFFICIAL_COMMANDS;
    return OFFICIAL_COMMANDS.filter(c =>
      c.command.toLowerCase().includes(f) || c.label.toLowerCase().includes(f)
    );
  })();

  // V3.0: 动态 placeholder — 从预设提示词随机选取
  const placeholderText = useMemo(() => {
    const pool = [
      '试试说：帮我写一篇小红书种草文案...',
      '试试说：帮我把产品图做成带货视频...',
      '试试说：最近有什么AI相关热点？',
      '试试说：帮我分析这篇文章的要点...',
      '试试说：生成一张赛博朋克风格的海报...',
      '试试说：帮我的产品写一段口播脚本...',
      '试试说：给这张图去背景...',
      '试试说：把这段文字转成语音...',
    ];
    return pool[Math.floor(Math.random() * pool.length)];
  }, []);

  const selectSlashCommand = (cmd: typeof OFFICIAL_COMMANDS[0]) => {
    const ta = inputRef.current;
    const cursorPos = ta?.selectionStart || slashMenu.pos + 1;
    const before = input.substring(0, slashMenu.pos);
    const after = input.substring(cursorPos);
    setInput(before + cmd.command + ' ' + after);
    setSlashMenu({ show: false, filter: '', index: 0, pos: 0 });
    setTimeout(() => ta?.focus(), 0);
    const newPos = slashMenu.pos + cmd.command.length + 1;
    setTimeout(() => {
      const ta = inputRef.current;
      if (ta) { ta.selectionStart = newPos; ta.selectionEnd = newPos; }
    }, 50);
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sseClientRef = useRef<AgentSSEClient | null>(null);
  const assistantMsgRef = useRef<string>('');
  const activeFlowRef = useRef(activeFlow);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressHandledRef = useRef(false);
  const sessionLoadedRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPastingRef = useRef(false);
  const fileMapRef = useRef<Map<string, File | Blob>>(new Map());
  const uploadPromisesRef = useRef<Map<string, Promise<string | null>>>(new Map());

  // Intl.Segmenter — 安全设置光标位置（正确处理 emoji/CJK 字形簇）
  const setCursorSafe = useCallback((el: HTMLTextAreaElement, pos: number) => {
    try {
      const segmenter = new Intl.Segmenter('zh-Hans-CN', { granularity: 'grapheme' });
      const segments = Array.from(segmenter.segment(el.value));
      // 将 grapheme 索引映射回 UTF-16 code unit 偏移
      if (pos >= segments.length) {
        el.selectionStart = el.selectionEnd = el.value.length;
      } else {
        el.selectionStart = el.selectionEnd = segments[pos]?.index ?? el.value.length;
      }
    } catch {
      el.selectionStart = el.selectionEnd = pos;
    }
  }, []);

  // 语音录制
  const voice = useVoiceRecording();
  const { isRecording, recordingTime, liveTranscript, startRecording, stopRecording, cancelRecording } = voice;
  const [pressingMic, setPressingMic] = useState(false);        // 按住瞬间高亮
  const [cancelGesture, setCancelGesture] = useState(false);    // 上滑取消状态
  const pressStartYRef = useRef(0);                              // 按下 Y 坐标，用于检测上滑

  // 文件上传
  const fileUpload = useFileUpload();
  const { uploadError, setUploadError, uploadFile, pickImage, pickDocument, pickAudio, revokePreview, validateFile, createPreview } = fileUpload;

  // 输入历史（undo/redo 最多 50 步）
  const inputHistory = useInputHistory(input, setInput);

  // 技能推荐
  const skillRecs = useSkillRecommendations();

  // V3-2.3: 动态技能匹配 — 输入变化时调后端 API 匹配技能
  const [dynamicRecs, setDynamicRecs] = useState<SkillRecommendation[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);

  // V3-3: 扣点确认弹窗
  const [creditConfirm, setCreditConfirm] = useState<{ cost: number; label: string } | null>(null);
  const pendingSendRef = useRef<() => void>(() => {});
  useEffect(() => {
    const trimmed = input.trim();
    if (trimmed.length < 3) {
      setDynamicRecs([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setRecsLoading(true);
        const apiClient = (await import('@/lib/api-client')).apiClient;
        const res = await apiClient.post('/assistant/skills', { action: 'match', query: trimmed });
        if (res.success && Array.isArray(res.data)) {
          setDynamicRecs(res.data.slice(0, 6).map((m: any) => ({
            name: m.skill?.name || m.name,
            displayName: m.skill?.displayName || m.displayName,
            score: m.score || 0,
          })));
        }
      } catch {
        setDynamicRecs([]);
      } finally {
        setRecsLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [input]);

  // 会话管理
  const sessionMgr = useAgentSessions();
  const {
    sessions, currentSessionId,
    showSessionList, setShowSessionList, isLoading: isLoadingSessions,
    loadSessions, loadMessages, createSession,
    switchSession, deleteSession,
  } = sessionMgr;

  const currentSessionRef = useRef(currentSessionId);

  useEffect(() => {
    requestAnimationFrame(() => {
      const el = scrollContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [messages]);

  // 同步 ref 以便 doStream 闭包中读到最新值
  useEffect(() => { activeFlowRef.current = activeFlow; }, [activeFlow]);
  useEffect(() => { currentSessionRef.current = currentSessionId; }, [currentSessionId]);

  // 自动调整输入框高度
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [input]);

  // 加载会话列表
  useEffect(() => {
    if (sessionLoadedRef.current) return;
    sessionLoadedRef.current = true;
    loadSessions().then(list => {
      if (list.length > 0) {
        switchSession(list[0].id);
        loadMessages(list[0].id).then(msgs => {
          const uiMsgs: UIMessage[] = msgs.map((m: any) => {
            const meta = m.metadata || {};
            return {
              id: m.id,
              type: (m.type === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
              content: m.content || '',
              toolCalls: Array.isArray(meta.toolCalls) ? meta.toolCalls : [],
              attachments: Array.isArray(m.attachments) && m.attachments.length > 0 ? m.attachments : undefined,
              generatedImages: Array.isArray(meta.generatedImages) ? meta.generatedImages : undefined,
              generatedVideo: meta.generatedVideo || undefined,
              generatedAudio: meta.generatedAudio || undefined,
              schedules: Array.isArray(meta.schedules) ? meta.schedules : undefined,
              timestamp: new Date(m.created_at),
            };
          });
          setMessages(uiMsgs);
        });
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const doStream = useCallback(async (
    displayContent: string,
    uploadedImages: string[],
    uploadedVideos: string[],
    uploadedDocs: string[],
    attachmentInfo: { url: string; name: string; type: 'image' | 'video' | 'document' | 'audio' }[],
    sessionId: string | null,
  ) => {
    const assistantId = crypto.randomUUID();
    const assistantMsg: UIMessage = {
      id: assistantId,
      type: 'assistant',
      content: '',
      toolCalls: [],
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, assistantMsg]);
    setIsStreaming(true);
    setStatusText('');
    setCurrentTool('');
    assistantMsgRef.current = '';

    const client = new AgentSSEClient();
    sseClientRef.current = client;

    try {
      for await (const event of client.stream('/api/ai/agent/chat', {
        content: displayContent,
        images: uploadedImages.length > 0 ? uploadedImages : undefined,
        documents: uploadedDocs.length > 0 ? uploadedDocs : undefined,
        session_id: sessionId || undefined,
      })) {
        switch (event.type) {
          case 'plan_generated':
            setPlanProgress({
              goal: event.plan.goal,
              totalSteps: event.plan.subgoals.length,
              completedSteps: 0,
              currentStep: event.plan.subgoals[0]?.title || null,
            });
            break;

          case 'plan_progress':
            setPlanProgress({
              goal: event.goal,
              totalSteps: event.totalSteps,
              completedSteps: event.completedSteps,
              currentStep: event.currentStep,
            });
            break;

          case 'edit_plan_generated':
            setMessages((prev) =>
              prev.map((m) => m.id === assistantId ? { ...m, editPlan: event.editPlan } : m)
            );
            break;

          case 'thinking':
            setStatusText(event.message);
            break;

          case 'tool_call':
            setCurrentTool(event.tool);
            setStatusText('executing');
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                return { ...m, toolCalls: [...m.toolCalls, { tool: event.tool, params: event.params }] };
              })
            );
            break;

          case 'tool_result': {
            setCurrentTool('');
            setStatusText('');
            const resultData = event.result.data as Record<string, unknown> | undefined;

            // 流程自动推进：工具成功 → 匹配当前步骤入口 → 步进
            // 使用 ref 避免 doStream 闭包捕获过期 state
            const flow = activeFlowRef.current;
            const sid = currentSessionRef.current;
            if (event.result.success && flow) {
              const expectedEntry = TOOL_TO_ENTRY[event.tool];
              if (expectedEntry) {
                const curStepEntry = flow.combo.steps[flow.currentStep]?.entry;
                if (expectedEntry === curStepEntry && flow.currentStep < flow.combo.steps.length - 1) {
                  setActiveFlow(prev => {
                    if (!prev) return null;
                    const next = { ...prev, currentStep: prev.currentStep + 1 };
                    sessionMgr.updateMetadata(sid!, { comboId: prev.combo.id, currentStep: next.currentStep });
                    return next;
                  });
                }
              }
            }
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                const toolCalls = [...m.toolCalls];
                const last = toolCalls[toolCalls.length - 1];
                if (last && last.tool === event.tool) last.result = event.result;

                let generatedImages = m.generatedImages;
                let generatedAudio = m.generatedAudio;
                let generatedVideo = m.generatedVideo;
                let schedules = m.schedules;

                let editPlan = m.editPlan;

                if (resultData) {
                  if (event.tool === 'generate_image' && Array.isArray(resultData.imageUrls)) {
                    generatedImages = [...(m.generatedImages || []), ...resultData.imageUrls as string[]];
                  }
                  if (event.tool === 'edit_image' && typeof resultData.resultUrl === 'string') {
                    generatedImages = [...(m.generatedImages || []), resultData.resultUrl as string];
                  }
                  if (event.tool === 'synthesize_speech' && typeof resultData.audioBase64 === 'string') {
                    generatedAudio = `data:audio/mpeg;base64,${resultData.audioBase64}`;
                  }
                  if (event.tool === 'synthesize_speech' && typeof resultData.audioUrl === 'string') {
                    generatedAudio = resultData.audioUrl as string;
                  }
                  if ((event.tool === 'generate_video' || event.tool === 'generate_digital_human') && typeof resultData.taskId === 'string') {
                    generatedVideo = {
                      taskId: resultData.taskId as string,
                      status: (resultData.status as string) || 'queued',
                      videoUrl: resultData.videoUrl as string | undefined,
                    };
                  }
                  if (event.tool === 'generate_video_template' && typeof resultData.url === 'string') {
                    generatedVideo = {
                      taskId: (resultData.renderId as string) || '',
                      status: 'completed',
                      videoUrl: resultData.url as string,
                    };
                  }
                  if (event.tool === 'extract_schedule' && Array.isArray(resultData.schedules)) {
                    schedules = resultData.schedules as ScheduleItem[];
                  }
                  if (event.tool === 'generate_edit_plan' && resultData.editPlan && typeof resultData.editPlan === 'object') {
                    editPlan = resultData.editPlan as EditPlan;
                  }
                }

                return { ...m, toolCalls, generatedImages, generatedAudio, generatedVideo, schedules, editPlan };
              })
            );
            break;
          }

          case 'delta':
            assistantMsgRef.current += event.content;
            setMessages((prev) =>
              prev.map((m) => m.id === assistantId ? { ...m, content: assistantMsgRef.current } : m)
            );
            break;

          case 'done':
            if (event.response && !assistantMsgRef.current) {
              assistantMsgRef.current = event.response;
              setMessages((prev) =>
                prev.map((m) => m.id === assistantId ? { ...m, content: event.response } : m)
              );
            }
            setStatusText('');
            setCurrentTool('');
            break;

          case 'error':
            setMessages((prev) =>
              prev.map((m) => m.id === assistantId ? { ...m, content: `出错了: ${event.message}` } : m)
            );
            setStatusText('');
            setCurrentTool('');
            break;

          case 'skills_matched':
            skillRecs.processEvent(event as any);
            break;
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') { /* cancelled */ } else {
        setMessages((prev) =>
          prev.map((m) => m.id === assistantId ? { ...m, content: `网络错误: ${e instanceof Error ? e.message : String(e)}` } : m)
        );
      }
    } finally {
      setIsStreaming(false);
      sseClientRef.current = null;
    }
  }, []);

  // 实际执行发送
  const doActualSend = useCallback(async () => {
    const trimmed = input.trim();

    // 上传附件
    const uploadedImages: string[] = [];
    const uploadedVideos: string[] = [];
    const uploadedDocs: string[] = [];
    const attachmentInfo: { url: string; name: string; type: 'image' | 'video' | 'document' | 'audio' }[] = [];

    for (const af of attachedFiles) {
      // 优先用已上传的 URL（选文件时已开始上传），否则等待/上传
      let url = af.uploadedUrl || null;
      if (!url) {
        const pending = uploadPromisesRef.current.get(af.id);
        url = pending ? await pending : await uploadFile(af.file);
      }
      if (url) {
        const type: 'image' | 'video' | 'document' | 'audio' = af.type;
        attachmentInfo.push({ url, name: af.file.name, type });
        if (type === 'image') uploadedImages.push(url);
        else if (type === 'video') uploadedVideos.push(url);
        else if (type === 'audio') uploadedDocs.push(url);
        else uploadedDocs.push(url);
        // 保存 File 引用供本地 ffmpeg 剪辑使用
        fileMapRef.current.set(af.file.name, af.file);
        fileMapRef.current.set(url, af.file);
      }
      if (af.type === 'image' || af.type === 'video' || af.type === 'audio') revokePreview(af.preview);
    }

    let displayContent = trimmed;
    if (!displayContent && uploadedDocs.length > 0) {
      displayContent = `请分析这份文档：${attachedFiles.filter(f => f.type === 'document').map(f => f.file.name).join('、')}`;
    }
    if (!displayContent && uploadedVideos.length > 0) {
      displayContent = `请分析这个视频`;
    }
    if (!displayContent && uploadedImages.length > 0) {
      displayContent = `请分析这${uploadedImages.length}张图片`;
    }

    // 如果没有当前会话，自动创建
    let sessionId = currentSessionId;
    if (!sessionId) {
      const title = trimmed ? (trimmed.substring(0, 30) + (trimmed.length > 30 ? '...' : '')) : '新对话';
      const session = await createSession(title);
      if (session) sessionId = session.id;
    }

    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      type: 'user',
      content: displayContent,
      toolCalls: [],
      attachments: attachmentInfo.length > 0 ? attachmentInfo : undefined,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setAttachedFiles([]);

    await doStream(displayContent, uploadedImages, uploadedVideos, uploadedDocs, attachmentInfo, sessionId);
  }, [input, isStreaming, attachedFiles, currentSessionId, uploadFile, revokePreview, createSession, doStream]);

  const handleSendWithText = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    // 上传附件
    const uploadedImages: string[] = [];
    const uploadedVideos: string[] = [];
    const uploadedDocs: string[] = [];
    const attachmentInfo: { url: string; name: string; type: 'image' | 'video' | 'document' | 'audio' }[] = [];

    for (const af of attachedFiles) {
      let url = af.uploadedUrl || null;
      if (!url) {
        const pending = uploadPromisesRef.current.get(af.id);
        url = pending ? await pending : await uploadFile(af.file);
      }
      if (url) {
        const type: 'image' | 'video' | 'document' | 'audio' = af.type;
        attachmentInfo.push({ url, name: af.file.name, type });
        if (type === 'image') uploadedImages.push(url);
        else if (type === 'video') uploadedVideos.push(url);
        else if (type === 'audio') uploadedDocs.push(url);
        else uploadedDocs.push(url);
        fileMapRef.current.set(af.file.name, af.file);
        fileMapRef.current.set(url, af.file);
      }
      if (af.type === 'image' || af.type === 'video' || af.type === 'audio') revokePreview(af.preview);
    }

    let sessionId = currentSessionId;
    if (!sessionId) {
      const title = trimmed.substring(0, 30) + (trimmed.length > 30 ? '...' : '');
      const session = await createSession(title);
      if (session) sessionId = session.id;
    }

    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      type: 'user',
      content: trimmed,
      toolCalls: [],
      attachments: attachmentInfo.length > 0 ? attachmentInfo : undefined,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setAttachedFiles([]);

    await doStream(trimmed, uploadedImages, uploadedVideos, uploadedDocs, attachmentInfo, sessionId);
  }, [isStreaming, attachedFiles, currentSessionId, uploadFile, revokePreview, createSession, doStream]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    const hasFiles = attachedFiles.length > 0;
    if ((!trimmed && !hasFiles) || isStreaming) return;

    // V3-3: 检测生成意图，弹扣点确认
    const genCost = detectGenCost(trimmed);
    if (genCost && !hasFiles) {
      pendingSendRef.current = () => {
        setCreditConfirm(null);
        doActualSend();
      };
      setCreditConfirm(genCost);
      return;
    }

    doActualSend();
  }, [input, isStreaming, attachedFiles, doActualSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 斜杠菜单导航
    if (slashMenu.show && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashMenu(prev => ({ ...prev, index: Math.min(prev.index + 1, filteredCommands.length - 1) }));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashMenu(prev => ({ ...prev, index: Math.max(prev.index - 1, 0) }));
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        selectSlashCommand(filteredCommands[slashMenu.index]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashMenu({ show: false, filter: '', index: 0, pos: 0 });
        return;
      }
    }

    const mod = e.metaKey || e.ctrlKey;

    // Undo: Ctrl+Z / Cmd+Z（无 Shift）
    if (mod && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      inputHistory.undo();
      return;
    }

    // Redo: Ctrl+Shift+Z / Cmd+Shift+Z
    if (mod && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      inputHistory.redo();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAbort = () => {
    sseClientRef.current?.abort();
    setIsStreaming(false);
  };

  // 按住说话手势 — pointer + touch 双兼容
  const cancelGestureRef = useRef(false);
  const touchActiveRef = useRef(false);

  const handlePressStart = (e: React.PointerEvent | React.TouchEvent) => {
    if (e.nativeEvent.type === 'pointerdown' && touchActiveRef.current) return;
    if (e.nativeEvent.type === 'touchstart') {
      touchActiveRef.current = true;
      setTimeout(() => { touchActiveRef.current = false; }, 500);
    }
    if ('button' in e && e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    setPressingMic(true);
    setCancelGesture(false);
    cancelGestureRef.current = false;
    const clientY = 'touches' in e ? (e as React.TouchEvent).touches[0]?.clientY : (e as React.PointerEvent).clientY;
    pressStartYRef.current = clientY || 0;
    // 立即开始录音，不等延迟
    pressHandledRef.current = true;
    if (navigator.vibrate) navigator.vibrate(30);
    startRecording();
  };

  const handlePressEnd = async (e?: React.PointerEvent | React.TouchEvent) => {
    if (e && e.nativeEvent.type === 'pointerup' && touchActiveRef.current) return;
    setPressingMic(false);
    setCancelGesture(false);

    if (cancelGestureRef.current) {
      cancelRecording();
      cancelGestureRef.current = false;
      return;
    }
    try {
      const transcript = await stopRecording();
      if (transcript) {
        setInput(transcript);
        handleSendWithText(transcript);
      }
    } catch {
      cancelRecording();
    }
  };

  // 录音中追踪手指移动 → 上滑超过 60px 进入取消状态
  const handleRecordingMove = (e: React.PointerEvent | React.TouchEvent) => {
    if (!isRecording) return;
    const clientY = 'touches' in e ? (e as React.TouchEvent).touches[0]?.clientY : (e as React.PointerEvent).clientY;
    const dy = pressStartYRef.current - clientY;
    cancelGestureRef.current = dy > 60;
    setCancelGesture(dy > 60);
  };

  // 选文件后立即上传，不等发送
  const attachAndUpload = useCallback((af: AttachedFile) => {
    setAttachedFiles(prev => [...prev, af]);
    const promise = uploadFile(af.file).then(url => {
      setAttachedFiles(prev => prev.map(f => f.id === af.id ? { ...f, uploadedUrl: url || undefined } : f));
      uploadPromisesRef.current.delete(af.id);
      return url;
    });
    uploadPromisesRef.current.set(af.id, promise);
  }, [uploadFile]);

  // 附件操作
  const handlePickImage = async () => {
    setShowTools(false);
    const file = await pickImage();
    if (file) attachAndUpload(file);
  };

  const handlePickVideo = () => {
    setShowTools(false);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const validTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
      if (!validTypes.includes(file.type)) return;
      if (file.size > 100 * 1024 * 1024) return;
      const preview = URL.createObjectURL(file);
      fileMapRef.current.set(file.name, file);
      attachAndUpload({ id: Date.now().toString(), file, preview, type: 'video' as const });
    };
    input.click();
  };

  const handlePickDocument = async () => {
    setShowTools(false);
    const file = await pickDocument();
    if (file) attachAndUpload(file);
  };

  const handlePickAudio = async () => {
    setShowTools(false);
    const file = await pickAudio();
    if (file) attachAndUpload(file);
  };

  // 相机拍照 — 移动端打开摄像头，桌面端回退到文件选择
  const handleCameraCapture = () => {
    setShowTools(false);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    // capture="environment" 在移动端直接打开后置摄像头
    if (/Mobi|Android|iPhone/i.test(navigator.userAgent)) {
      input.setAttribute('capture', 'environment');
    }
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      // 预览用本地 URL，上传靠 uploadFile
      const preview = URL.createObjectURL(file);
      fileMapRef.current.set(file.name, file);
      const imageFile: AttachedFile = {
        id: Date.now().toString(),
        file,
        preview,
        type: 'image' as const,
      };
      attachAndUpload(imageFile);
    };
    input.click();
  };

  const removeAttachedFile = (id: string) => {
    setAttachedFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file?.type === 'image' || file?.type === 'video') revokePreview(file.preview);
      return prev.filter(f => f.id !== id);
    });
  };

  // 消息操作
  const handleCopy = useCallback((msg: UIMessage) => {
    const text = msg.content || '';
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 1500);
    }).catch(() => {});
  }, []);

  const handleRegenerate = useCallback(async (msg: UIMessage) => {
    if (isStreaming) return;
    setRegeneratingId(msg.id);
    const msgIndex = messages.findIndex(m => m.id === msg.id);
    let userMsg: UIMessage | null = null;
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].type === 'user') { userMsg = messages[i]; break; }
    }
    if (!userMsg) { setRegeneratingId(null); return; }

    const images = userMsg.attachments?.filter(a => a.type === 'image').map(a => a.url) || [];
    const docs = userMsg.attachments?.filter(a => a.type === 'document').map(a => a.url) || [];
    const attachmentInfo = userMsg.attachments || [];

    setMessages(prev => prev.filter(m => m.id !== msg.id));
    await doStream(userMsg.content, images, [], docs, attachmentInfo, currentSessionId);
    setRegeneratingId(null);
  }, [isStreaming, messages, currentSessionId, doStream]);

  const handleDelete = useCallback((msg: UIMessage) => {
    setMessages(prev => prev.filter(m => m.id !== msg.id));
  }, []);

  const handleSaveToInspiration = useCallback(async (msg: UIMessage) => {
    const text = msg.content;
    if (!text) return;

    // 找到之前用户消息作为 prompt
    const msgIndex = messages.findIndex(m => m.id === msg.id);
    let userPrompt = '';
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].type === 'user') { userPrompt = messages[i].content; break; }
    }

    try {
      const baseUrl = window.location.origin;
      const title = (userPrompt || text).substring(0, 50);
      const res = await fetch(`${baseUrl}/api/inspiration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          original_text: text,
          prompt: userPrompt || null,
          type: 'text',
          tags: ['Agent生成'],
        }),
      });
      if (res.ok) {
        setCopiedId('saved_' + msg.id);
        setTimeout(() => setCopiedId(null), 1500);
      }
    } catch { /* 静默失败 */ }
  }, [messages]);

  const handleSpeak = useCallback(async (msg: UIMessage) => {
    const text = msg.content;
    if (!text) return;
    try {
      const baseUrl = window.location.origin;
      const res = await fetch(`${baseUrl}/api/ai/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'default' }),
      });
      const data = await res.json();
      if (data.success && data.data?.audioBase64) {
        const audio = new Audio(`data:audio/mpeg;base64,${data.data.audioBase64}`);
        audio.play();
      }
    } catch { /* 静默失败 */ }
  }, []);

  const handleShare = useCallback(async (msg: UIMessage) => {
    const text = msg.content || '';
    if (navigator.share) {
      try {
        await navigator.share({ title: '灵集 AI 生成内容', text: text.substring(0, 200) });
      } catch { /* 用户取消 */ }
    } else {
      // 降级：复制内容
      navigator.clipboard.writeText(text).then(() => {
        setCopiedId('shared_' + msg.id);
        setTimeout(() => setCopiedId(null), 1500);
      }).catch(() => {});
    }
  }, []);

  // 保存后立即调度通知提醒
  const scheduleReminder = (schedule: { id: string; title: string; scheduled_at: string; description?: string; remind_before?: number }) => {
    const scheduledAt = new Date(schedule.scheduled_at);
    if (isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) return;
    const id = Math.abs(schedule.id.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)) % 2147483647;
    scheduleNotification({
      id,
      title: schedule.title,
      body: schedule.description || `${scheduledAt.toLocaleString('zh-CN')} 开始`,
      scheduledAt,
      remindBeforeMinutes: schedule.remind_before || 30,
    });
  };

  const addToSchedule = useCallback(async (msg: UIMessage, scheduleIndex?: number, editedData?: { title: string; scheduled_at: string; description?: string; location?: string }) => {
    const list = msg.schedules;
    if (!list || list.length === 0) return;

    // 单条编辑模式：使用编辑后的数据
    if (scheduleIndex !== undefined && editedData) {
      const s = list[scheduleIndex];
      const merged = { ...s, ...editedData };
      setSchedulingId(msg.id);
      try {
        const baseUrl = window.location.origin;
        const res = await fetch(`${baseUrl}/api/schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: merged.title,
            description: merged.description || undefined,
            scheduled_at: merged.scheduled_at,
            location: merged.location || undefined,
            color: '#8B5CF6',
            remind_before: 30,
            suggestions: s.suggestions?.length ? s.suggestions : undefined,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.data?.id) {
            scheduleReminder(data.data);
          }
          setScheduledItems(prev => { const next = new Set(prev); next.add(`${msg.id}-${scheduleIndex}`); return next; });
        }
      } catch { /* ignore */ }
      setTimeout(() => setSchedulingId(null), 2000);
      return;
    }

    // 批量添加模式
    const itemsToAdd = scheduleIndex !== undefined
      ? [list[scheduleIndex]]
      : list.filter((_, i) => !scheduledItems.has(`${msg.id}-${i}`));
    if (itemsToAdd.length === 0) return;
    setSchedulingId(msg.id);
    try {
      const baseUrl = window.location.origin;
      for (const s of itemsToAdd) {
        const res = await fetch(`${baseUrl}/api/schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: s.title,
            description: s.description || undefined,
            scheduled_at: s.scheduled_at,
            location: s.location || undefined,
            color: '#8B5CF6',
            remind_before: 30,
            suggestions: s.suggestions?.length ? s.suggestions : undefined,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.data?.id) {
            scheduleReminder(data.data);
          }
        }
      }
      setScheduledItems(prev => {
        const next = new Set(prev);
        if (scheduleIndex !== undefined) {
          next.add(`${msg.id}-${scheduleIndex}`);
        } else {
          list.forEach((_, i) => next.add(`${msg.id}-${i}`));
        }
        return next;
      });
      setTimeout(() => setSchedulingId(null), 2000);
    } catch {
      setSchedulingId(null);
    }
  }, [scheduledItems]);

  const handleChoiceSubmit = useCallback(async () => {
    if (isStreaming || choiceSubmitting) return;

    // 收集所有 block 的选择
    const parts: string[] = [];
    for (const sel of choiceSelections.values()) {
      for (const opt of sel.options) {
        parts.push(opt.label);
      }
      if (sel.customInput.trim()) {
        parts.push(sel.customInput.trim());
      }
    }
    if (parts.length === 0) return;

    setChoiceSubmitting(true);
    const labels = parts.join('、');
    const lastUserMsg = [...messages].reverse().find(m => m.type === 'user');
    const context = lastUserMsg?.content || '';
    const choiceText = `我的选择：${labels}${context ? `\n\n原始需求：${context}` : ''}`;

    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      type: 'user',
      content: choiceText,
      toolCalls: [],
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setChoiceSelections(new Map());

    await doStream(choiceText, [], [], [], [], currentSessionId);
    setChoiceSubmitting(false);
  }, [isStreaming, choiceSubmitting, choiceSelections, messages, currentSessionId, doStream]);

  // ParamCard 参数提交
  const handleParamSubmit = useCallback(async () => {
    if (isStreaming || paramSubmitting) return;

    // 从最后一条 assistant 消息解析 param_cards 来获取 schema
    const lastMsg = [...messages].reverse().find(m => m.type === 'assistant');
    if (!lastMsg) return;
    const { cards } = parseParamCards(lastMsg.content);
    if (cards.length === 0) return;

    const parts: string[] = [];
    for (let i = 0; i < cards.length; i++) {
      const values = paramValues.get(i);
      if (!values) continue;
      const formatted = formatParamValues(cards[i], values);
      if (formatted) parts.push(formatted);
    }
    if (parts.length === 0) return;

    setParamSubmitting(true);
    const lastUserMsg = [...messages].reverse().find(m => m.type === 'user');
    const context = lastUserMsg?.content || '';
    const paramText = `用户选择的参数：\n${parts.join('\n')}\n\n${context ? `原始需求：${context}` : ''}\n\n请按照以上参数继续生成。`;

    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      type: 'user',
      content: paramText,
      toolCalls: [],
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setParamValues(new Map());

    await doStream(paramText, [], [], [], [], currentSessionId);
    setParamSubmitting(false);
  }, [isStreaming, paramSubmitting, paramValues, messages, currentSessionId, doStream]);

  // 从本地选择素材并自动注入对话
  const handlePickLocalMedia = useCallback(async (mediaType: 'image' | 'video') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = mediaType === 'image' ? 'image/*' : 'video/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const maxSize = mediaType === 'image' ? 20 * 1024 * 1024 : 100 * 1024 * 1024;
      if (file.size > maxSize) { setUploadError(`文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB）`); return; }
      const url = await uploadFile(file);
      if (!url) return;
      const lastUserMsg = [...messages].reverse().find(m => m.type === 'user');
      const ctx = lastUserMsg?.content || '';
      const label = mediaType === 'image' ? '图片' : '视频';
      const text = `我的选择：已上传${label} ${url}${ctx ? `\n\n原始需求：${ctx}` : ''}`;
      const userMsg: UIMessage = { id: crypto.randomUUID(), type: 'user', content: text, toolCalls: [], timestamp: new Date() };
      setMessages(prev => [...prev, userMsg]);
      setChoiceSelections(new Map());
      await doStream(text, mediaType === 'image' ? [url] : [], mediaType === 'video' ? [url] : [], [], [], currentSessionId);
    };
    input.click();
  }, [messages, currentSessionId, doStream, uploadFile, setUploadError]);

  // 从灵感库选择素材
  const handlePickInspirationMedia = useCallback((mediaType: 'image' | 'video') => {
    setInspPickerMediaType(mediaType);
    setInspPickerOpen(true);
  }, []);

  // 灵感库选择后的回调
  const handleInspirationSelect = useCallback(async (item: { id: string; url: string; title?: string; type: string }) => {
    const lastUserMsg = [...messages].reverse().find(m => m.type === 'user');
    const ctx = lastUserMsg?.content || '';
    const label = item.type === 'image' ? '图片' : '视频';
    const text = `我的选择：已选${label} ${item.url}${item.title ? ` (${item.title})` : ''}${ctx ? `\n\n原始需求：${ctx}` : ''}`;
    const userMsg: UIMessage = { id: crypto.randomUUID(), type: 'user', content: text, toolCalls: [], timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setChoiceSelections(new Map());
    await doStream(text, item.type === 'image' ? [item.url] : [], item.type === 'video' ? [item.url] : [], [], [], currentSessionId);
  }, [messages, currentSessionId, doStream]);

  // 会话操作
  const handleSwitchSession = async (session: AgentSession) => {
    switchSession(session.id);
    setIsLoadingMessages(true);
    setMessages([]);
    setSelectedAccountType(null);

    // 从会话元数据恢复流程状态
    const meta = session.metadata as { comboId?: string; currentStep?: number } | undefined;
    if (meta?.comboId) {
      const combos = ACCOUNT_TYPE_PRESETS.flatMap(p => p.combos);
      const combo = combos.find(c => c.id === meta.comboId);
      if (combo) {
        setActiveFlow({ combo, currentStep: meta.currentStep || 0 });
      } else {
        setActiveFlow(null);
      }
    } else {
      setActiveFlow(null);
    }
    const msgs = await loadMessages(session.id);
    const uiMsgs: UIMessage[] = msgs.map((m: any) => {
      const meta = m.metadata || {};
      return {
        id: m.id,
        type: (m.type === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content || '',
        toolCalls: Array.isArray(meta.toolCalls) ? meta.toolCalls : [],
        attachments: Array.isArray(m.attachments) && m.attachments.length > 0 ? m.attachments : undefined,
        generatedImages: Array.isArray(meta.generatedImages) ? meta.generatedImages : undefined,
        generatedVideo: meta.generatedVideo || undefined,
        generatedAudio: meta.generatedAudio || undefined,
        schedules: Array.isArray(meta.schedules) ? meta.schedules : undefined,
        timestamp: new Date(m.created_at),
      };
    });
    setMessages(uiMsgs);
    setIsLoadingMessages(false);
  };

  const startEditTitle = (sessionId: string, currentTitle: string) => {
    setEditingTitle(sessionId);
    setEditTitleValue(currentTitle);
  };

  const saveEditTitle = async () => {
    if (editingTitle && editTitleValue.trim()) {
      await sessionMgr.updateTitle(editingTitle, editTitleValue.trim());
    }
    setEditingTitle(null);
  };

  const handleNewSession = () => {
    createSession();
    setMessages([]);
    setChoiceSelections(new Map());
    setSelectedAccountType(null);
    setActiveFlow(null);
    setAccountSearch('');
    setShowSessionList(false);
    fileMapRef.current = new Map();
    uploadPromisesRef.current = new Map();
  };

  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    deleteSession(sessionId);
    if (currentSessionId === sessionId) setMessages([]);
  };

  // 账号类型 → 组合推荐 → 流程引导
  const handleStartCombo = async (combo: RecommendationCombo) => {
    const flowMeta = { comboId: combo.id, currentStep: 0 };
    const session = await createSession(combo.title, flowMeta);
    if (!session) return;

    setActiveFlow({ combo, currentStep: 0 });
    setSelectedAccountType(null);
    setAccountSearch('');

    const stepsText = combo.steps.map((s, i) => `${i + 1}. ${s.label}`).join('\n');
    const kickoffMsg = `我要开始「${combo.emoji} ${combo.title}」创作流程。\n\n完整流程：\n${stepsText}\n\n请从第1步「${combo.steps[0].label}」开始引导我。先告诉我这个流程的整体目标，然后告诉我第1步需要准备什么。`;

    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      type: 'user',
      content: kickoffMsg,
      toolCalls: [],
      timestamp: new Date(),
    };
    setMessages([userMsg]);

    await doStream(kickoffMsg, [], [], [], [], session.id);
  };

  // 点击步骤节点 → 跳到该步骤重做
  const handleJumpToStep = async (stepIndex: number) => {
    const flow = activeFlowRef.current;
    if (!flow || !currentSessionRef.current) return;

    // 中断进行中的 Agent 请求
    sseClientRef.current?.abort();

    setActiveFlow({ combo: flow.combo, currentStep: stepIndex });
    await sessionMgr.updateMetadata(currentSessionRef.current, {
      comboId: flow.combo.id,
      currentStep: stepIndex,
    });

    const step = flow.combo.steps[stepIndex];
    const redoMsg = `请重新从第${stepIndex + 1}步「${step.label}」开始。`;

    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      type: 'user',
      content: redoMsg,
      toolCalls: [],
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    await doStream(redoMsg, [], [], [], [], currentSessionRef.current);
  };

  return (
    <div className="flex flex-col h-full">
      {/* 顶部 — 返回 + 会话选择器 + 新建 */}
      <div className="relative flex items-center px-4 py-3 border-b border-white/10">
        {/* 返回按钮 */}
        <button
          onClick={() => router.back()}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* 会话选择器 — 居中 */}
        <div className="flex-1 flex justify-center items-center gap-2">
          <button
            onClick={() => setShowSessionList(!showSessionList)}
            className="flex items-center gap-1.5 max-w-[200px]"
          >
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {editingTitle === currentSessionId ? (
              <input
                autoFocus
                value={editTitleValue}
                onChange={(e) => setEditTitleValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEditTitle();
                  if (e.key === 'Escape') setEditingTitle(null);
                }}
                onBlur={saveEditTitle}
                onClick={(e) => e.stopPropagation()}
                className="bg-gray-700 text-white text-sm rounded px-1.5 py-0.5 outline-none max-w-[140px]"
              />
            ) : (
              <span
                className="truncate text-sm text-white cursor-default"
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  const sid = currentSessionId;
                  const title = sessions.find(s => s.id === sid)?.title || '对话助手';
                  if (sid) startEditTitle(sid, title);
                }}
                title="双击修改名称"
              >
                {currentSessionId
                  ? sessions.find(s => s.id === currentSessionId)?.title || '对话助手'
                  : '对话助手'}
              </span>
            )}
            <svg className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* 新建对话 */}
        <button
          onClick={handleNewSession}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
          title="新建对话"
        >
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m-7-7h14" />
          </svg>
        </button>

        {/* 会话列表下拉 */}
        {showSessionList && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setShowSessionList(false)} />
            <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 w-72 bg-gray-800 border border-gray-700 rounded-xl shadow-xl max-h-72 overflow-y-auto">
              <div className="p-2 border-b border-gray-700">
                <button
                  onClick={handleNewSession}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-gray-700 text-gray-300 text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m-7-7h14" />
                  </svg>
                  新对话
                </button>
              </div>
              {isLoadingSessions ? (
                <div className="p-4 text-center text-gray-500 text-sm">加载中...</div>
              ) : sessions.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">暂无历史对话</div>
              ) : sessions.map(s => (
                <div
                  key={s.id}
                  onClick={() => { if (editingTitle !== s.id) handleSwitchSession(s); }}
                  className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-700/50 text-sm ${s.id === currentSessionId ? 'bg-gray-700/30 text-white' : 'text-gray-400'}`}
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  {editingTitle === s.id ? (
                    <input
                      autoFocus
                      value={editTitleValue}
                      onChange={(e) => setEditTitleValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEditTitle();
                        if (e.key === 'Escape') setEditingTitle(null);
                      }}
                      onBlur={() => setTimeout(saveEditTitle, 150)}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-gray-600 text-white text-sm rounded px-1.5 py-0.5 outline-none flex-1 min-w-0"
                    />
                  ) : (
                    <span
                      className="truncate flex-1"
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        startEditTitle(s.id, s.title);
                      }}
                      title="双击修改名称"
                    >{s.title}</span>
                  )}
                  {editingTitle !== s.id && (
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault(); // 防止按钮卸载时焦点丢失
                        e.stopPropagation();
                        startEditTitle(s.id, s.title);
                      }}
                      className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-600/50 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="修改名称"
                    >
                      <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={(e) => handleDeleteSession(e, s.id)}
                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-600/50 flex-shrink-0"
                  >
                    <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 流程引导头部 — 始终可见（非滚动区域） */}
      {activeFlow && messages.length > 0 && (
        <div className="px-4 py-2.5 border-b border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{activeFlow.combo.emoji}</span>
            <span className="text-sm font-semibold text-white">{activeFlow.combo.title}</span>
            <span className="text-[10px] text-gray-500">第 {activeFlow.currentStep + 1}/{activeFlow.combo.steps.length} 步</span>
            <button
              onClick={async () => {
                setActiveFlow(null);
                if (currentSessionId) {
                  sessionMgr.updateMetadata(currentSessionId, {});
                }
              }}
              className="ml-auto w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
              title="删除流程"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-1">
            {activeFlow.combo.steps.map((step, i) => (
              <div key={i} className="flex items-center gap-1 flex-1 min-w-0">
                {i > 0 && <div className="flex-1 h-px bg-white/10 min-w-[8px]" />}
                <button
                  onClick={() => handleJumpToStep(i)}
                  className={`flex flex-col items-center gap-0.5 transition-all hover:opacity-80 active:scale-95 cursor-pointer ${
                    i === activeFlow.currentStep ? 'text-blue-300' :
                    i < activeFlow.currentStep ? 'text-green-300/60' :
                    'text-gray-600'
                  }`}
                  title={`${step.label} — 点击跳转到此步骤`}
                >
                  <span className={`w-4.5 h-4.5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
                    i === activeFlow.currentStep ? 'bg-blue-500 text-white' :
                    i < activeFlow.currentStep ? 'bg-green-500/20 text-green-300' :
                    'bg-white/5 text-gray-500'
                  }`}>
                    {i < activeFlow.currentStep ? '✓' : i + 1}
                  </span>
                  <span className="text-[8px] text-center leading-tight max-w-[44px] truncate">{step.label}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 消息列表 — pb-32 给固定输入框留空间 */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto py-4 space-y-1 pb-32">
        {messages.length === 0 && !isLoadingSessions && !isLoadingMessages && (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            {/* Logo */}
            <img
              src="/brand/logo-mark.png"
              alt="灵集"
              className="w-20 h-20 mb-5"
              style={{ filter: 'drop-shadow(0 0 24px rgba(139,92,246,0.5))' }}
            />

            {/* 欢迎语 */}
            <h2 className="text-lg font-semibold text-white mb-2">
              你好！我是灵集AI，你的智能创作助手
            </h2>

            {/* 副标题 */}
            <p className="text-xs text-white mb-4">
              从灵感采集到内容创作，一站式帮你高效产出优质内容
            </p>

            {/* 账号类型选择 / 推荐组合 */}
            <div className="w-full max-w-sm mb-4">
              {!selectedAccountType ? (
                <>
                  {/* 搜索 */}
                  <div className="relative mb-3">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      value={accountSearch}
                      onChange={(e) => setAccountSearch(e.target.value)}
                      placeholder="搜索账号类型..."
                      className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 outline-none focus:border-blue-500/50"
                    />
                  </div>
                  {/* 账号类型网格 */}
                  <div className="grid grid-cols-2 gap-2 max-h-[340px] overflow-y-auto pr-0.5">
                    {ACCOUNT_TYPE_PRESETS.filter(p =>
                      !accountSearch || p.label.includes(accountSearch) || p.desc.includes(accountSearch)
                    ).map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => setSelectedAccountType(preset)}
                        className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-blue-500/30 transition-all text-left"
                      >
                        <span className="text-2xl">{preset.emoji}</span>
                        <span className="text-sm font-medium text-white">{preset.label}</span>
                        <span className="text-[10px] text-gray-400 leading-tight text-center line-clamp-2">{preset.desc}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  {/* 选中账号类型 + 返回 */}
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={() => { setSelectedAccountType(null); setAccountSearch(''); }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 flex-shrink-0"
                    >
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <span className="text-2xl">{selectedAccountType.emoji}</span>
                    <span className="text-sm font-semibold text-white">{selectedAccountType.label}</span>
                    <span className="text-[10px] text-gray-500">{selectedAccountType.audience}</span>
                  </div>
                  {/* 推荐组合列表 */}
                  <div className="space-y-2 max-h-[340px] overflow-y-auto pr-0.5">
                    {selectedAccountType.combos.map((combo) => (
                      <button
                        key={combo.id}
                        onClick={() => handleStartCombo(combo)}
                        className="w-full p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-blue-500/30 transition-all text-left"
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-lg">{combo.emoji}</span>
                          <span className="text-sm font-semibold text-white">{combo.title}</span>
                        </div>
                        <p className="text-[11px] text-gray-400 mb-2">{combo.desc}</p>
                        <div className="flex items-center gap-1 flex-wrap">
                          {combo.steps.map((step, i) => (
                            <span key={i} className="inline-flex items-center gap-0.5">
                              {i > 0 && <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>}
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/5">
                                {step.label}
                              </span>
                            </span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

          </div>
        )}

        {/* 加载消息中 */}
        {isLoadingMessages && (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="ml-3 text-sm text-gray-400">加载消息中...</span>
          </div>
        )}

        {/* 计划进度条 */}
        {planProgress && (
          <div className="mx-4 mb-4 p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-blue-400">目标</span>
              <span className="text-sm text-white/80">{planProgress.goal}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${planProgress.totalSteps > 0 ? (planProgress.completedSteps / planProgress.totalSteps) * 100 : 0}%`,
                  }}
                />
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {planProgress.completedSteps}/{planProgress.totalSteps}
              </span>
            </div>
            {planProgress.currentStep && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                当前: {planProgress.currentStep}
              </div>
            )}
          </div>
        )}

        {messages.map((msg) => {
          // 对 assistant 消息，始终清理 choices 标签，避免显示原始 XML
          const cleaned = msg.type === 'assistant' ? parseChoices(msg.content).cleanedText : msg.content;
          const displayContent = cleaned || msg.content;

          return (
            <div key={msg.id}>
              <AgentMessage
                type={msg.type}
                content={displayContent}
                toolCalls={msg.toolCalls.length > 0 ? msg.toolCalls : undefined}
                attachments={msg.attachments}
                generatedImages={msg.generatedImages}
                generatedVideo={msg.generatedVideo}
                generatedAudio={msg.generatedAudio}
                schedules={msg.schedules}
                scheduledItems={scheduledItems}
                schedulingId={schedulingId}
                onAddSchedule={(idx, edited) => addToSchedule(msg, idx, edited)}
                onAddAllSchedules={() => addToSchedule(msg)}
                messageId={msg.id}
                timestamp={msg.timestamp}
                onCopy={() => handleCopy(msg)}
                onRegenerate={msg.type === 'assistant' ? () => handleRegenerate(msg) : undefined}
                onDelete={() => handleDelete(msg)}
                onSaveToInspiration={msg.type === 'assistant' ? () => handleSaveToInspiration(msg) : undefined}
                onSpeak={msg.type === 'assistant' ? () => handleSpeak(msg) : undefined}
                onShare={msg.type === 'assistant' ? () => handleShare(msg) : undefined}
                isCopied={copiedId === msg.id || copiedId === 'saved_' + msg.id || copiedId === 'shared_' + msg.id}
                isRegenerating={regeneratingId === msg.id}
              />
              {msg.editPlan && (
                <div className="px-4">
                  <EditPlanCard
                    plan={msg.editPlan}
                    fileMap={fileMapRef.current}
                    onDownload={(blob, name) => {
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = name;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}

        {/* 交互式选项卡片 — 最后一条 assistant 消息包含 choices 时显示 */}
        {(() => {
          const lastMsg = messages[messages.length - 1];
          if (!lastMsg || lastMsg.type !== 'assistant' || isStreaming) return null;
          const { choices } = parseChoices(lastMsg.content);
          if (choices.length === 0) return null;

          const hasAnySelection = Array.from(choiceSelections.values()).some(
            s => s.options.length > 0 || s.customInput.trim()
          );

          return (
            <div className="px-4">
              {choices.map((block, i) => (
                <ChoiceCards
                  key={i}
                  block={block}
                  onChange={(sel) => {
                    setChoiceSelections(prev => {
                      const next = new Map(prev);
                      next.set(i, sel);
                      return next;
                    });
                  }}
                  onPickLocal={block.type ? () => handlePickLocalMedia(block.type!) : undefined}
                  onPickInspiration={block.type ? () => handlePickInspirationMedia(block.type!) : undefined}
                />
              ))}

              {/* 统一发送选择按钮 — 最下方 */}
              <button
                onClick={handleChoiceSubmit}
                disabled={!hasAnySelection || choiceSubmitting}
                className="w-full mt-3 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-all active:scale-95"
                style={{
                  background: hasAnySelection
                    ? 'linear-gradient(135deg, #3B82F6, #8B5CF6)'
                    : 'rgba(255,255,255,0.08)',
                  color: hasAnySelection ? '#FFFFFF' : 'rgba(255,255,255,0.3)',
                  opacity: choiceSubmitting ? 0.6 : 1,
                  cursor: hasAnySelection ? 'pointer' : 'default',
                }}
              >
                {choiceSubmitting ? (
                  <>处理中...</>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    发送选择
                  </>
                )}
              </button>
            </div>
          );
        })()}

        {/* ParamCard — 结构化参数选择（滑块/开关/下拉），与 <choices> 并存 */}
        {(() => {
          const lastMsg = messages[messages.length - 1];
          if (!lastMsg || lastMsg.type !== 'assistant' || isStreaming) return null;
          const { cards } = parseParamCards(lastMsg.content);
          if (cards.length === 0) return null;

          const hasParamValues = Array.from(paramValues.values()).some(
            v => Object.keys(v).length > 0
          );

          return (
            <div className="px-4 space-y-3 mt-3">
              {cards.map((schema, i) => (
                <ParamCard
                  key={i}
                  schema={schema}
                  onChange={(values) => {
                    setParamValues(prev => {
                      const next = new Map(prev);
                      next.set(i, values);
                      return next;
                    });
                  }}
                />
              ))}

              <button
                onClick={handleParamSubmit}
                disabled={!hasParamValues || paramSubmitting}
                className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-all active:scale-95"
                style={{
                  background: hasParamValues
                    ? 'linear-gradient(135deg, #3B82F6, #8B5CF6)'
                    : 'rgba(255,255,255,0.08)',
                  color: hasParamValues ? '#FFFFFF' : 'rgba(255,255,255,0.3)',
                  opacity: paramSubmitting ? 0.6 : 1,
                  cursor: hasParamValues ? 'pointer' : 'default',
                }}
              >
                {paramSubmitting ? (
                  <>处理中...</>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    确认参数，开始生成
                  </>
                )}
              </button>
            </div>
          );
        })()}

        {/* 思考指示器 */}
        {isStreaming && (statusText === 'executing' || statusText === 'thinking' || statusText) && (
          <ThinkingIndicator
            status={statusText === 'executing' ? 'executing' : 'thinking'}
            toolName={currentTool}
            message={statusText === 'executing' || statusText === 'thinking' ? undefined : statusText}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 上传错误提示 */}
      {uploadError && (
        <div className="fixed bottom-24 left-0 right-0 mx-auto w-fit max-w-[448px] px-4 z-30">
          <div className="p-2 rounded-lg flex items-center gap-2 text-xs bg-red-500/15 border border-red-500/30 text-red-300">
            <span>{uploadError}</span>
            <button className="ml-auto" onClick={() => setUploadError(null)}>✕</button>
          </div>
        </div>
      )}

      {/* 输入区域 — 固定置底 */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0A1629]/95 backdrop-blur-lg border-t border-white/10 px-4 pt-2 pb-3 z-10" style={{ maxWidth: 480, margin: '0 auto' }}>
        {/* 引导语 — 欢迎状态下底部显示 */}
        {messages.length === 0 && (
          <p className="text-center text-sm text-blue-300 mb-2">
            今天你有什么灵感，发送给我！
          </p>
        )}
        {/* 动态技能推荐 — 仅文字模式 */}
        {inputMode === 'text' && dynamicRecs.length > 0 && (
          <SkillRecommendCards
            recommendations={dynamicRecs}
            loading={recsLoading}
            onSelect={(skill) => { setInput(`/${skill.name} `); inputRef.current?.focus(); }}
          />
        )}
        {/* 快捷能力标签 — 仅文字模式 */}
        {inputMode === 'text' && (
          <div className="mb-2">
            <CapabilityTags onSelect={(prompt) => { setInput(prompt); inputRef.current?.focus(); }} />
          </div>
        )}
        <div className="relative">
        {isRecording ? (
          /* ───── 录音中 ───── */
          <div className="flex flex-col items-center gap-3 py-2">
            {/* 录音动画指示 */}
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full animate-pulse ${
                cancelGesture ? 'bg-red-500' : 'bg-red-500'
              }`} style={{ animationDuration: '0.6s' }} />
              <span className={`text-sm font-medium ${
                cancelGesture ? 'text-red-400' : 'text-red-300'
              }`}>
                {cancelGesture ? '松手取消' : '正在聆听...'}
              </span>
            </div>
            {/* 实时转写 */}
            {liveTranscript && (
              <div className="w-full px-4 py-2.5 rounded-xl text-sm text-center bg-white/5 border border-white/5 text-gray-200">
                <span className="line-clamp-2">{liveTranscript}</span>
              </div>
            )}
            {/* 提示 */}
            <p className={`text-xs transition-colors ${
              cancelGesture ? 'text-red-400 font-medium' : 'text-gray-500'
            }`}>
              {cancelGesture ? '↑ 上移取消' : '松开 发送'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {/* 附件预览 */}
            {attachedFiles.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1 items-end">
                {attachedFiles.map(af => (
                  <div key={af.id} className="relative flex-shrink-0">
                    {af.uploadedUrl ? (
                      <div className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center z-10">
                        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    ) : (
                      <div className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center z-10">
                        <div className="w-2 h-2 border border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                    {af.type === 'document' ? (
                      <div className="w-14 h-14 rounded-lg border border-gray-700 flex flex-col items-center justify-center gap-0.5 bg-blue-500/10">
                        <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="text-[9px] text-gray-400 truncate max-w-[48px] leading-none">
                          {af.file.name.split('.').pop()?.toUpperCase()}
                        </span>
                      </div>
                    ) : af.type === 'video' ? (
                      <div className="w-20 h-14 rounded-lg overflow-hidden border border-gray-700 bg-black">
                        <video
                          src={af.preview}
                          className="w-full h-full object-cover"
                          playsInline
                          muted
                          preload="metadata"
                          onMouseEnter={(e) => { try { (e.target as HTMLVideoElement).play(); } catch {} }}
                          onMouseLeave={(e) => { try { (e.target as HTMLVideoElement).pause(); (e.target as HTMLVideoElement).currentTime = 0; } catch {} }}
                          onTouchStart={(e) => {
                            const v = e.target as HTMLVideoElement;
                            if (v.paused) { try { v.play(); } catch {} } else { try { v.pause(); } catch {} }
                          }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <svg className="w-4 h-4 text-white drop-shadow-md" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    ) : af.type === 'audio' ? (
                      <div className="flex items-center gap-2 px-2.5 h-14 rounded-lg border border-gray-700 bg-green-500/10 min-w-[160px]">
                        <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                        <audio
                          src={af.preview}
                          controls
                          preload="metadata"
                          className="h-8 flex-1 min-w-0"
                          style={{ maxWidth: 180 }}
                        />
                      </div>
                    ) : (
                      <img src={af.preview} alt="" className="w-14 h-14 rounded-lg object-cover border border-gray-700" />
                    )}
                    <button
                      onClick={() => removeAttachedFile(af.id)}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gray-800 border border-gray-600 flex items-center justify-center"
                    >
                      <svg className="w-2 h-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 斜杠指令下拉 */}
            {slashMenu.show && (
              <div
                className="absolute bottom-full left-4 right-4 mb-2 rounded-xl overflow-hidden z-50 max-h-[260px] overflow-y-auto"
                style={{ background: 'rgba(15,23,42,0.98)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(20px)' }}
              >
                {filteredCommands.length === 0 ? (
                  <div className="px-4 py-6 text-center">
                    <p className="text-xs text-gray-500">没有匹配的技能指令</p>
                  </div>
                ) : (
                  filteredCommands.map((cmd, i) => (
                    <button
                      key={cmd.command}
                      onClick={() => selectSlashCommand(cmd)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition-colors"
                      style={{ background: i === slashMenu.index ? 'rgba(59,130,246,0.1)' : 'transparent' }}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(59,130,246,0.15)' }}
                      >
                        <svg className="w-4 h-4 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-200">{cmd.command}</p>
                        <p className="text-[11px] text-gray-500 truncate">{cmd.label} — {cmd.desc}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* ───── 豆包风格输入栏 ───── */}
            <div className="flex items-center gap-2">
              {/* 📷 相机按钮 */}
              <button
                onClick={handleCameraCapture}
                className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors active:scale-90"
                title="拍照"
              >
                <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <circle cx="12" cy="13" r="3" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
                </svg>
              </button>

              {/* 中间：语音胶囊 / 文字输入 / 流式中止 */}
              {isStreaming ? (
                <button
                  onClick={handleAbort}
                  className="flex-1 h-11 rounded-full flex items-center justify-center gap-2 text-sm font-medium transition-all active:scale-95"
                  style={{
                    background: 'rgba(239,68,68,0.15)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    color: '#FCA5A5',
                  }}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                  停止生成
                </button>
              ) : inputMode === 'voice' ? (
                <button
                  onPointerDown={handlePressStart}
                  onPointerUp={handlePressEnd}
                  onPointerCancel={handlePressEnd}
                  onPointerMove={handleRecordingMove}
                  onTouchStart={handlePressStart}
                  onTouchEnd={handlePressEnd}
                  onTouchCancel={handlePressEnd}
                  onTouchMove={handleRecordingMove}
                  onContextMenu={(e) => e.preventDefault()}
                  className={`flex-1 h-11 rounded-full flex items-center justify-center select-none transition-all duration-200 active:scale-[0.97] ${
                    pressingMic ? 'scale-[1.02] shadow-lg shadow-red-500/30' : ''
                  }`}
                  style={{
                    background: pressingMic
                      ? 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
                      : 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
                  }}
                >
                  <span className="text-white text-sm font-medium tracking-wide">
                    {pressingMic ? '松开 发送' : '按住说话'}
                  </span>
                </button>
              ) : (
                <div className="flex-1 bg-white/5 rounded-xl px-3 py-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => {
                      const val = e.target.value;
                      setInput(val);
                      if (isPastingRef.current) {
                        isPastingRef.current = false;
                        return;
                      }
                      const cursor = e.target.selectionStart || 0;
                      const textBefore = val.substring(0, cursor);
                      const slashMatch = textBefore.match(/(?:^|\s)\/(\S*)$/);
                      if (slashMatch) {
                        const slashPos = textBefore.lastIndexOf('/');
                        setSlashMenu({ show: true, filter: slashMatch[1], index: 0, pos: slashPos });
                      } else {
                        setSlashMenu({ show: false, filter: '', index: 0, pos: 0 });
                      }
                      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                      debounceTimerRef.current = setTimeout(() => {}, 150);
                    }}
                    onPaste={(e) => {
                      const items = e.clipboardData?.items;
                      if (items) {
                        for (let i = 0; i < items.length; i++) {
                          const item = items[i];
                          if (item.type.startsWith('image/')) {
                            e.preventDefault();
                            const file = item.getAsFile();
                            if (!file) continue;
                            if (!validateFile(file, 'image')) continue;
                            const attached: AttachedFile = {
                              id: Date.now().toString() + '_' + i,
                              file,
                              preview: createPreview(file),
                              type: 'image',
                            };
                            attachAndUpload(attached);
                            return;
                          }
                        }
                      }
                      isPastingRef.current = true;
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={attachedFiles.length > 0 ? '添加描述...' : placeholderText}
                    rows={1}
                    className="w-full bg-transparent text-white text-sm placeholder-white/30 outline-none resize-none max-h-[120px] py-0.5"
                    disabled={isStreaming}
                  />
                </div>
              )}

              {/* ⌨/🎤 切换按钮 — 仅语音可用时显示 */}
              {speechSupported && (
              <button
                onClick={() => setInputMode(prev => prev === 'voice' ? 'text' : 'voice')}
                className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors active:scale-90"
                title={inputMode === 'voice' ? '切换文字输入' : '切换语音输入'}
              >
                {inputMode === 'voice' ? (
                  <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7h16M4 12h16M4 17h10" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-gray-300" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3z" />
                    <path d="M19 11a7 7 0 01-14 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
              </button>
              )}

              {/* 📎 上传按钮 + 弹出菜单 */}
              <div className="relative">
                <button
                  onClick={() => setShowTools(!showTools)}
                  className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors active:scale-90"
                  title="上传"
                >
                  <svg className={`w-5 h-5 text-gray-300 ${showTools ? 'rotate-45' : ''} transition-transform`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </button>
                {showTools && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowTools(false)} />
                    <div className="absolute bottom-12 right-0 z-40 bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-1.5 w-40">
                      <button onClick={() => { setShowTools(false); handleCameraCapture(); }} className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-gray-700 text-sm text-gray-200">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <circle cx="12" cy="13" r="3" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
                        </svg>
                        拍照
                      </button>
                      <button onClick={() => { setShowTools(false); handlePickImage(); }} className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-gray-700 text-sm text-gray-200">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        图片
                      </button>
                      <button onClick={() => { setShowTools(false); handlePickVideo(); }} className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-gray-700 text-sm text-gray-200">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        视频
                      </button>
                      <button onClick={() => { setShowTools(false); handlePickDocument(); }} className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-gray-700 text-sm text-gray-200">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        文档
                      </button>
                      <button onClick={() => { setShowTools(false); handlePickAudio(); }} className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-gray-700 text-sm text-gray-200">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                        音频
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 文字模式下有内容时显示发送按钮 */}
            {inputMode === 'text' && (input.trim() || attachedFiles.length > 0) && !isStreaming && (
              <div className="flex justify-end">
                <button
                  onClick={handleSend}
                  className="px-5 py-2 rounded-full text-sm font-medium text-white transition-all active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)' }}
                >
                  发送
                </button>
              </div>
            )}
          </div>
        )}
        </div>
      </div>

    {/* 灵感库素材选择弹窗 */}
    {/* V3-3: 扣点确认弹窗 */}
    {creditConfirm && (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={() => setCreditConfirm(null)}>
        <div
          className="w-full max-w-[480px] rounded-t-2xl p-6 pb-8"
          style={{ background: 'rgba(15, 23, 42, 0.98)', backdropFilter: 'blur(20px)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-semibold text-white mb-2">确认操作</h3>
          <p className="text-sm text-gray-300 mb-4">
            你即将使用 <span className="text-blue-400 font-medium">{creditConfirm.label}</span>
            ，预计消耗 <span className="text-amber-400 font-medium">{creditConfirm.cost} 灵力</span>
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setCreditConfirm(null)}
              className="flex-1 py-3 rounded-xl text-sm font-medium border border-white/20 text-gray-300 hover:bg-white/5 transition-colors"
            >
              取消
            </button>
            <button
              onClick={() => pendingSendRef.current()}
              className="flex-1 py-3 rounded-xl text-sm font-medium text-white transition-colors"
              style={{ background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)' }}
            >
              确认生成 ({creditConfirm.cost} 💎)
            </button>
          </div>
        </div>
      </div>
    )}
    <InspirationPicker
      open={inspPickerOpen}
      onClose={() => setInspPickerOpen(false)}
      onSelect={handleInspirationSelect}
      mediaType={inspPickerMediaType}
    />
    </div>
  );
}
