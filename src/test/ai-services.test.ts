import { vi, it, expect, describe, afterEach, afterAll } from 'vitest';
import {
  submitVideoTask,
  getVideoTaskStatus,
  generateImage,
} from '../lib/ai-services';

// Mock environment variables for DashScope (HappyHorse) and Seedance (ARK)
vi.stubEnv('HAPPYHORSE_API_KEY', 'test-happyhorse-key');
vi.stubEnv('DASHSCOPE_API_KEY', 'test-dashscope-key');
vi.stubEnv('DOUBAO_API_KEY', 'test-api-key');
vi.stubEnv('SEEDANCE_IMAGE_MODEL_ARK_ID', 'ep-test-image');

// Mock fetch
const originalFetch = global.fetch;
vi.stubGlobal('fetch', vi.fn());

afterEach(() => {
  (fetch as unknown as ReturnType<typeof vi.fn>).mockClear();
});

afterAll(() => {
  vi.stubGlobal('fetch', originalFetch);
});

const mockFetch = () => fetch as unknown as ReturnType<typeof vi.fn>;

describe('Video Generation', () => {
  it('submits video task to DashScope HappyHorse API', async () => {
    // First call: optimizePrompt (chat/completions) — return mock that makes it return rawPrompt
    mockFetch()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ choices: [{ message: { content: 'enhanced prompt' } }] }),
      })
      // Second call: actual video API
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ output: { task_id: 'task-123' } }),
      });

    const result = await submitVideoTask('test prompt', 5);

    // Find the video API call (second fetch)
    const calls = mockFetch().mock.calls;
    const videoCall = calls.find((c: any[]) => c[0].includes('video-synthesis'));
    const [url, options] = videoCall;
    expect(url).toContain('/services/aigc/video-generation/video-synthesis');
    const body = JSON.parse(options.body);
    expect(body.model).toBe('happyhorse-1.0-t2v');
    expect(body.input.prompt).toContain('enhanced prompt');
    expect(body.parameters.duration).toBe(5);

    expect(result).toEqual({
      taskId: 'task-123',
      status: 'queued',
      message: '任务已提交',
    });
  });

  it('handles API error response', async () => {
    mockFetch()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ choices: [{ message: { content: 'enhanced prompt' } }] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue('Bad request'),
      });

    const result = await submitVideoTask('test prompt', 5);

    expect(result).toEqual({
      taskId: null,
      status: 'error',
      message: '视频服务错误: 400',
    });
  });

  it('handles network errors', async () => {
    mockFetch()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ choices: [{ message: { content: 'enhanced prompt' } }] }),
      })
      .mockRejectedValueOnce(new Error('Network failed'));

    const result = await submitVideoTask('test prompt', 5);

    expect(result).toEqual({
      taskId: null,
      status: 'error',
      message: '网络错误',
    });
  });

  it('handles status polling (SUCCEEDED)', async () => {
    mockFetch().mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        output: {
          task_status: 'SUCCEEDED',
          video_url: 'https://example.com/video.mp4',
        },
      }),
    });

    const result = await getVideoTaskStatus('task-123');

    expect(result).toEqual({
      status: 'succeeded',
      videoUrl: 'https://example.com/video.mp4',
      message: '生成完成',
    });
  });

  it('handles running status', async () => {
    mockFetch().mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        output: { task_status: 'RUNNING' },
      }),
    });

    const result = await getVideoTaskStatus('task-123');

    expect(result).toEqual({
      status: 'running',
      message: '生成中...',
    });
  });
});

describe('Image Generation', () => {
  it('uses correct size parameters', async () => {
    // First call: submit task
    mockFetch()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          output: { task_id: 'img-task-123' },
        }),
      })
      // Second call: poll status (SUCCEEDED)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          output: {
            task_status: 'SUCCEEDED',
            results: [{ url: 'https://example.com/image.jpg' }],
          },
        }),
      });

    await generateImage('test prompt', { ratio: '16:9', skipOptimize: true });

    const submitCall = mockFetch().mock.calls[0];
    const [, options] = submitCall;
    const body = JSON.parse(options.body);
    expect(body.parameters.size).toContain('1440*810');
  });

  it('handles image API errors', async () => {
    mockFetch().mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: vi.fn().mockResolvedValue('Model not found'),
    });

    await expect(generateImage('test prompt', { skipOptimize: true })).rejects.toThrow(
      '图片生成失败: 400 Model not found'
    );
  });
});
