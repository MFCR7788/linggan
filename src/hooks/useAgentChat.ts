'use client';

// Agent 聊天状态管理 Hook — 消息、流式、语音、附件、会话、操作

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useInputHistory } from '@/hooks/use-input-history';
import { useSkillRecommendations, type SkillRecommendation } from '@/components/agent/SkillRecommendCards';
import { type ChoiceSelection } from '@/components/agent/ChoiceCards';
import { parseChoices, type ChoiceOption } from '@/lib/agent/choice-parser';
import { parseParamCards, formatParamValues } from '@/lib/agent/param-parser';
import { AgentSSEClient } from '@/lib/agent/sse-client';
import { useSpeechRecognition } from '@/hooks/use-speech-recognition';
import { useVoiceRecording } from '@/hooks/use-voice-recording';
import { useFileUpload } from '@/hooks/use-file-upload';
import { useAgentSessions } from '@/hooks/use-agent-sessions';
import type { AttachedFile } from '@/hooks/use-file-upload';
import type { AgentSession } from '@/hooks/use-agent-sessions';
import { ACCOUNT_TYPE_PRESETS, type RecommendationCombo, type AccountTypePreset } from '@/lib/account-presets';
import { scheduleNotification } from '@/lib/notification-service';
import { CREDIT_COSTS } from '@/lib/credit-costs';
import { useSkills } from '@/hooks/use-skills';
import { REWRITE_STYLES } from '@/lib/style-constants';
import type { EditPlan } from '@/lib/agent/types';

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

export interface UIMessage {
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
  optimization?: { original: string; framework: string; confidence: number };
  timestamp: Date;
}

export interface ScheduleItem {
  title: string;
  scheduled_at: string;
  description?: string;
  location?: string;
  suggestions?: string[];
}

export interface ToolCallRecord {
  tool: string;
  params: Record<string, unknown>;
  result?: { success: boolean; output: string; data?: unknown; error?: string };
}

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

export function useAgentChat() {
  const router = useRouter();
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [currentTool, setCurrentTool] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [showTools, setShowTools] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('text');
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
  const [consecutiveNoFeedback, setConsecutiveNoFeedback] = useState(0);

  // 账号类型选择 + 流程引导
  const [selectedAccountType, setSelectedAccountType] = useState<AccountTypePreset | null>(null);
  const [activeFlow, setActiveFlow] = useState<{ combo: RecommendationCombo; currentStep: number } | null>(null);
  const [accountSearch, setAccountSearch] = useState('');
  const [planProgress, setPlanProgress] = useState<{ goal: string; totalSteps: number; completedSteps: number; currentStep: string | null } | null>(null);

  // 素材选择器
  const [inspPickerOpen, setInspPickerOpen] = useState(false);
  // 改写选择器
  const [showRewritePicker, setShowRewritePicker] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  // 全屏输入
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showExpandBtn, setShowExpandBtn] = useState(false);
  const [inspPickerMediaType, setInspPickerMediaType] = useState<'image' | 'video'>('image');

  // 斜杠指令
  const [slashMenu, setSlashMenu] = useState<{ show: boolean; filter: string; index: number; pos: number }>({
    show: false, filter: '', index: 0, pos: 0,
  });

  const { data: installedSkills } = useSkills({ action: 'installed' });

  const availableCommands = useMemo(() => {
    const seen = new Set(OFFICIAL_COMMANDS.map(c => c.command));
    const list = [...OFFICIAL_COMMANDS];
    if (installedSkills) {
      for (const s of installedSkills) {
        const cmd = `/${s.name}`;
        if (!seen.has(cmd)) {
          seen.add(cmd);
          list.push({
            command: cmd,
            label: s.displayName || s.name,
            desc: (s.description || '').slice(0, 20),
            cat: s.category || '',
          });
        }
      }
    }
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 有意省略依赖
  }, [installedSkills]);

  const filteredCommands = useMemo(() => {
    if (!slashMenu.show) return [];
    const f = slashMenu.filter.toLowerCase();
    if (!f) return availableCommands;
    return availableCommands.filter(c =>
      c.command.toLowerCase().includes(f) || c.label.toLowerCase().includes(f)
    );
  }, [availableCommands, slashMenu]);

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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sseClientRef = useRef<AgentSSEClient | null>(null);
  const assistantMsgRef = useRef<string>('');
  const activeFlowRef = useRef(activeFlow);
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
      if (pos >= segments.length) {
        el.selectionStart = el.selectionEnd = el.value.length;
      } else {
        el.selectionStart = el.selectionEnd = segments[pos]?.index ?? el.value.length;
      }
    } catch {
      el.selectionStart = el.selectionEnd = pos;
    }
  }, []);

  // 语音识别（浏览器原生 SpeechRecognition API）+ MediaRecorder 降级
  const speech = useSpeechRecognition();
  const { isListening, liveText, supported: speechApiSupported, startListening, stopListening, cancelListening } = speech;
  const voiceRecording = useVoiceRecording();
  const { isRecording, startRecording, stopRecording, cancelRecording } = voiceRecording;
  const [isTranscribing, setIsTranscribing] = useState(false);

  // 语音是否可用: 原生 SpeechRecognition 或 MediaRecorder 降级
  const voiceSupported = speechApiSupported || (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined'
  );

  const isVoiceActive = isListening || isRecording || isTranscribing;
  const [pressingMic, setPressingMic] = useState(false);
  const [cancelGesture, setCancelGesture] = useState(false);
  const pressStartYRef = useRef(0);

  // 检测语音是否可用
  useEffect(() => {
    setSpeechSupported(voiceSupported);
    if (!voiceSupported) {
      setInputMode('text');
    }
  }, [voiceSupported]);

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
    switchSession, deleteSession, togglePin,
  } = sessionMgr;

  const currentSessionRef = useRef(currentSessionId);

  // 消息变化后滚动到底部
  useEffect(() => {
    const scroll = () => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' });
    };
    scroll();
    setTimeout(scroll, 100);
    setTimeout(scroll, 300);
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

  // 加载会话列表 → 有历史则直接进最后会话，无历史则新建
  useEffect(() => {
    if (sessionLoadedRef.current) return;
    sessionLoadedRef.current = true;
    loadSessions().then(list => {
      if (list.length > 0) {
        switchSession(list[0].id);
        setIsLoadingMessages(true);
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
              optimization: meta.promptOptimization || undefined,
              timestamp: new Date(m.created_at),
            };
          });
          setMessages(uiMsgs);
        }).finally(() => {
          setIsLoadingMessages(false);
        });
      } else {
        createSession();
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 流程自动推进 → 匹配当前步骤入口 → 步进（在 doStream 外复用）
  const advanceFlow = useCallback((tool: string, success: boolean) => {
    const flow = activeFlowRef.current;
    const sid = currentSessionRef.current;
    if (success && flow) {
      const expectedEntry = TOOL_TO_ENTRY[tool];
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
  }, [sessionMgr]);

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

            advanceFlow(event.tool, event.result.success);

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
            if (event.optimization) {
              setMessages((prev) =>
                prev.map((m) => m.id === assistantId ? { ...m, optimization: event.optimization } : m)
              );
            }
            setStatusText('');
            setCurrentTool('');
            setConsecutiveNoFeedback(prev => prev + 1);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 有意省略依赖
  }, [advanceFlow]);

  // 实际执行发送
  const doActualSend = useCallback(async () => {
    const trimmed = input.trim();

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 有意省略依赖
  }, [input, isStreaming, attachedFiles, currentSessionId, uploadFile, revokePreview, createSession, doStream]);

  const handleSendWithText = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

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

  // 斜杠指令选择
  const selectSlashCommand = useCallback((cmd: typeof availableCommands[0]) => {
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
  }, [input, slashMenu.pos]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
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

    if (mod && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      inputHistory.undo();
      return;
    }

    if (mod && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      inputHistory.redo();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [slashMenu, filteredCommands, inputHistory, handleSend, selectSlashCommand]);

  const handleAbort = useCallback(() => {
    sseClientRef.current?.abort();
    setIsStreaming(false);
  }, []);

  // 改写
  const executeRewrite = useCallback(async (style: string) => {
    const text = input.trim();
    if (text.length < 10) return;
    setShowRewritePicker(false);
    setIsRewriting(true);
    try {
      const { apiClient } = await import('@/lib/api-client');
      const data: any = await apiClient.post('/ai/rewrite', { content: text, style });
      if (data.success && data.response) {
        const assistantId = crypto.randomUUID();
        setMessages(prev => [...prev, {
          id: assistantId,
          type: 'assistant',
          content: data.response,
          toolCalls: [],
          timestamp: new Date(),
        }]);
      }
    } catch (e) {
      console.error('[Agent] Rewrite failed:', e);
    } finally {
      setIsRewriting(false);
    }
  }, [input]);

  // 为语音识别结果加标点
  const punctuateText = useCallback(async (text: string): Promise<string> => {
    if (!text || text.length > 500) return text;
    try {
      const res = await fetch('/api/ai/punctuate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.success && data.data?.text) return data.data.text.trim();
    } catch { /* 标点失败不影响主流程 */ }
    return text;
  }, []);

  // 按住说话手势
  const cancelGestureRef = useRef(false);

  const handlePressStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if ('button' in e && (e as React.MouseEvent).button !== 0) return;
    e.preventDefault();
    setPressingMic(true);
    setCancelGesture(false);
    cancelGestureRef.current = false;
    const clientY = 'touches' in e ? e.touches[0]?.clientY : (e as React.MouseEvent).clientY;
    pressStartYRef.current = clientY || 0;
    pressHandledRef.current = true;
    if (navigator.vibrate) navigator.vibrate(30);
    if (speechApiSupported) {
      startListening('zh-CN');
    } else {
      startRecording();
    }
  }, [speechApiSupported, startListening, startRecording]);

  const handlePressEnd = useCallback(async () => {
    setPressingMic(false);
    setCancelGesture(false);
    pressHandledRef.current = false;

    if (cancelGestureRef.current) {
      if (speechApiSupported) cancelListening();
      else cancelRecording();
      cancelGestureRef.current = false;
      return;
    }

    if (speechApiSupported) {
      const transcript = await stopListening();
      if (transcript) {
        const punctuated = await punctuateText(transcript);
        await handleSendWithText(punctuated);
      }
    } else {
      try {
        setIsTranscribing(true);
        const transcript = await stopRecording();
        setIsTranscribing(false);
        if (transcript) {
          const punctuated = await punctuateText(transcript);
          await handleSendWithText(punctuated);
        }
      } catch {
        setIsTranscribing(false);
        cancelRecording();
      }
    }
  }, [speechApiSupported, stopListening, cancelListening, stopRecording, cancelRecording, punctuateText, handleSendWithText]);

  const handleStopListening = useCallback(async () => {
    setPressingMic(false);
    setCancelGesture(false);
    cancelGestureRef.current = false;
    pressHandledRef.current = false;

    if (speechApiSupported) {
      const transcript = await stopListening();
      if (transcript) {
        const punctuated = await punctuateText(transcript);
        await handleSendWithText(punctuated);
      }
    } else {
      try {
        setIsTranscribing(true);
        const transcript = await stopRecording();
        setIsTranscribing(false);
        if (transcript) {
          const punctuated = await punctuateText(transcript);
          await handleSendWithText(punctuated);
        }
      } catch {
        setIsTranscribing(false);
        cancelRecording();
      }
    }
  }, [speechApiSupported, stopListening, stopRecording, cancelRecording, punctuateText, handleSendWithText]);

  const handleRecordingMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isVoiceActive) return;
    const clientY = 'touches' in e ? e.touches[0]?.clientY : (e as React.MouseEvent).clientY;
    const dy = pressStartYRef.current - clientY;
    cancelGestureRef.current = dy > 60;
    setCancelGesture(dy > 60);
  }, [isVoiceActive]);

  // 选文件后立即上传
  const attachAndUpload = useCallback((af: AttachedFile) => {
    setAttachedFiles(prev => [...prev, af]);
    const promise = uploadFile(af.file).then(url => {
      setAttachedFiles(prev => prev.map(f => f.id === af.id ? { ...f, uploadedUrl: url || undefined } : f));
      uploadPromisesRef.current.delete(af.id);
      return url;
    });
    uploadPromisesRef.current.set(af.id, promise);
  }, [uploadFile]);

  const handlePickImage = useCallback(async () => {
    setShowTools(false);
    const file = await pickImage();
    if (file) attachAndUpload(file);
  }, [pickImage, attachAndUpload]);

  const handlePickVideo = useCallback(() => {
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
  }, [attachAndUpload]);

  const handlePickDocument = useCallback(async () => {
    setShowTools(false);
    const file = await pickDocument();
    if (file) attachAndUpload(file);
  }, [pickDocument, attachAndUpload]);

  const handlePickAudio = useCallback(async () => {
    setShowTools(false);
    const file = await pickAudio();
    if (file) attachAndUpload(file);
  }, [pickAudio, attachAndUpload]);

  const handleCameraCapture = useCallback(() => {
    setShowTools(false);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (/Mobi|Android|iPhone/i.test(navigator.userAgent)) {
      input.setAttribute('capture', 'environment');
    }
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
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
  }, [attachAndUpload]);

  const removeAttachedFile = useCallback((id: string) => {
    setAttachedFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file?.type === 'image' || file?.type === 'video') revokePreview(file.preview);
      return prev.filter(f => f.id !== id);
    });
  }, [revokePreview]);

  const handleFeedbackGiven = useCallback(() => {
    setConsecutiveNoFeedback(0);
  }, []);

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

  const handleModify = useCallback((msg: UIMessage) => {
    setInput(msg.content || '');
    inputRef.current?.focus();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 有意省略依赖
  }, [setInput, setMessages]);

  const handleDelete = useCallback((msg: UIMessage) => {
    setMessages(prev => prev.filter(m => m.id !== msg.id));
  }, []);

  const handleSaveToInspiration = useCallback(async (msg: UIMessage) => {
    const text = msg.content;
    if (!text) return;

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
      navigator.clipboard.writeText(text).then(() => {
        setCopiedId('shared_' + msg.id);
        setTimeout(() => setCopiedId(null), 1500);
      }).catch(() => {});
    }
  }, []);

  // 保存后立即调度通知提醒
  const scheduleReminder = useCallback((schedule: { id: string; title: string; scheduled_at: string; description?: string; remind_before?: number }) => {
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
  }, []);

  const addToSchedule = useCallback(async (msg: UIMessage, scheduleIndex?: number, editedData?: { title: string; scheduled_at: string; description?: string; location?: string }) => {
    const list = msg.schedules;
    if (!list || list.length === 0) return;

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
  }, [scheduledItems, scheduleReminder]);

  const handleChoiceSubmit = useCallback(async () => {
    if (isStreaming || choiceSubmitting) return;

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

  const handleParamSubmit = useCallback(async () => {
    if (isStreaming || paramSubmitting) return;

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
  const handleSwitchSession = useCallback(async (session: AgentSession) => {
    switchSession(session.id);
    setIsLoadingMessages(true);
    setMessages([]);
    setSelectedAccountType(null);

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
    setConsecutiveNoFeedback(0);
    setIsLoadingMessages(false);
  }, [switchSession, loadMessages]);

  const startEditTitle = useCallback((sessionId: string, currentTitle: string) => {
    setEditingTitle(sessionId);
    setEditTitleValue(currentTitle);
  }, []);

  const saveEditTitle = useCallback(async () => {
    if (editingTitle && editTitleValue.trim()) {
      await sessionMgr.updateTitle(editingTitle, editTitleValue.trim());
    }
    setEditingTitle(null);
  }, [editingTitle, editTitleValue, sessionMgr]);

  const handleNewSession = useCallback(() => {
    createSession();
    setMessages([]);
    setChoiceSelections(new Map());
    setSelectedAccountType(null);
    setActiveFlow(null);
    setAccountSearch('');
    setShowSessionList(false);
    fileMapRef.current = new Map();
    uploadPromisesRef.current = new Map();
  }, [createSession, setShowSessionList]);

  const handleDeleteSession = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    deleteSession(sessionId);
    if (currentSessionId === sessionId) setMessages([]);
  }, [deleteSession, currentSessionId]);

  const handleTogglePin = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    togglePin(sessionId);
  }, [togglePin]);

  // 账号类型 → 组合推荐 → 流程引导
  const handleStartCombo = useCallback(async (combo: RecommendationCombo) => {
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
  }, [createSession, doStream]);

  // 清除流程引导
  const clearActiveFlow = useCallback(async () => {
    setActiveFlow(null);
    if (currentSessionRef.current) {
      await sessionMgr.updateMetadata(currentSessionRef.current, {});
    }
  }, [sessionMgr]);

  // 点击步骤节点 → 跳到该步骤重做
  const handleJumpToStep = useCallback(async (stepIndex: number) => {
    const flow = activeFlowRef.current;
    if (!flow || !currentSessionRef.current) return;

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
  }, [sessionMgr, doStream]);

  return {
    // 路由
    router,
    // 核心状态
    messages, setMessages,
    input, setInput,
    isStreaming, setIsStreaming,
    statusText, currentTool,
    attachedFiles, setAttachedFiles,
    showTools, setShowTools,
    speechSupported, inputMode, setInputMode,
    copiedId, regeneratingId,
    choiceSubmitting, choiceSelections, setChoiceSelections,
    paramValues, setParamValues, paramSubmitting,
    editingTitle, editTitleValue, setEditingTitle, setEditTitleValue,
    isLoadingMessages,
    scheduledItems, schedulingId,
    consecutiveNoFeedback,
    // 账号/流程
    selectedAccountType, setSelectedAccountType,
    activeFlow, setActiveFlow,
    accountSearch, setAccountSearch,
    planProgress, setPlanProgress,
    // UI 开关
    inspPickerOpen, setInspPickerOpen, inspPickerMediaType,
    showRewritePicker, setShowRewritePicker, isRewriting,
    isFullscreen, setIsFullscreen, showExpandBtn,
    slashMenu, setSlashMenu,
    creditConfirm, setCreditConfirm,
    // 语音
    pressingMic, cancelGesture, isVoiceActive, isTranscribing,
    liveText, speechApiSupported, voiceSupported,
    // 输入
    placeholderText,
    dynamicRecs, recsLoading,
    // 上传
    uploadError, setUploadError,
    uploadFile, validateFile, createPreview,
    // 斜杠
    availableCommands, filteredCommands,
    // 会话
    sessions, currentSessionId,
    showSessionList, setShowSessionList,
    isLoadingSessions,
    // Refs
    messagesEndRef, scrollContainerRef, inputRef,
    fileMapRef, uploadPromisesRef,
    // 核心操作
    handleSend, handleAbort, handleKeyDown, selectSlashCommand,
    handleCopy, handleRegenerate, handleModify, handleDelete,
    handleSaveToInspiration, handleSpeak, handleShare,
    addToSchedule,
    handleChoiceSubmit, handleParamSubmit,
    handlePickLocalMedia, handlePickInspirationMedia,
    handleInspirationSelect,
    // 会话操作
    handleSwitchSession, startEditTitle, saveEditTitle,
    handleNewSession, handleDeleteSession, handleTogglePin,
    // 流程
    handleStartCombo, handleJumpToStep, clearActiveFlow,
    // 语音/录音
    handlePressStart, handlePressEnd, handleStopListening, handleRecordingMove,
    // 文件
    handlePickImage, handlePickVideo, handlePickDocument, handlePickAudio,
    handleCameraCapture, removeAttachedFile, attachAndUpload,
    // 改写
    executeRewrite,
    handleFeedbackGiven,
    // 其他
    inputHistory, setCursorSafe,
    pendingSendRef,
    setSpeechSupported,
    setShowExpandBtn,
  };
}
