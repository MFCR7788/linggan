import { vi, it, expect, describe, afterEach, afterAll } from 'vitest';
import {
  submitVideoTask,
  getVideoTaskStatus,
  generateImage,
} from '../lib/ai-services';

// Mock environment variables for DashScope (HappyHorse) and Seedance (ARK)
vi.stubEnv('HAPPYHORSE_API_KEY', 'test-happyhorse-key');
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
    mockFetch().mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ output: { task_id: 'task-123' } }),
    });

    const result = await submitVideoTask('test prompt', 5);

    const [[url, options]] = mockFetch().mock.calls;
    expect(url).toContain('/services/aigc/video-generation/video-synthesis');
    const body = JSON.parse(options.body);
    expect(body.model).toBe('happyhorse-1.0-t2v');
    expect(body.input.prompt).toContain('test prompt');
    expect(body.parameters.duration).toBe(5);

    expect(result).toEqual({
      taskId: 'task-123',
      status: 'queued',
      message: '任务已提交',
    });
  });

  it('handles API error response', async () => {
    mockFetch().mockResolvedValueOnce({
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
    mockFetch().mockRejectedValueOnce(new Error('Network failed'));

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
    mockFetch().mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: [{ url: 'https://example.com/image.jpg' }],
      }),
    });

    await generateImage('test prompt', { ratio: '16:9' });

    const [[, options]] = mockFetch().mock.calls;
    expect(JSON.parse(options.body).size).toBe('2560x1440');
  });

  it('handles image API errors', async () => {
    mockFetch().mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: vi.fn().mockResolvedValue('Model not found'),
    });

    await expect(generateImage('test prompt')).rejects.toThrow(
      '图片生成失败: 400 Model not found'
    );
  });
});
