// src/test/ai-services.test.ts
import { vi, it, expect, describe, afterEach, afterAll } from 'vitest';
import {
  submitVideoTask,
  getVideoTaskStatus,
  generateImage,
} from '../lib/ai-services';

// Mock environment variables
vi.stubEnv('DOUBAO_API_KEY', 'test-api-key');
vi.stubEnv('SEEDANCE_VIDEO_MODEL_ARK_ID', 'ep-test-video');
vi.stubEnv('SEEDANCE_IMAGE_MODEL_ARK_ID', 'ep-test-image');

// Mock fetch
const originalFetch = global.fetch;
vi.stubGlobal('fetch', vi.fn());

afterEach(() => {
  (fetch as any).mockClear();
});

afterAll(() => {
  vi.stubGlobal('fetch', originalFetch);
});

describe('Video Generation', () => {
  it('submits video task with correct parameters', async () => {
    // Mock successful response
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 'task-123' }),
    });

    const result = await submitVideoTask('test prompt', 5);

    // Verify request structure
    const [[url, options]] = (fetch as any).mock.calls;
    expect(url).toContain('/contents/generations/tasks');
    expect(JSON.parse(options.body)).toEqual({
      model: 'ep-test-video',
      content: 'test prompt', // Critical: must be string not array
      ratio: '16:9',
      duration: 5,
      watermark: false,
    });

    expect(result).toEqual({
      taskId: 'task-123',
      status: 'queued',
      message: '任务已提交',
    });
  });

  it('handles invalid content field error', async () => {
    // Mock API error response
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          error: {
            message: 'Invalid content field: must be string',
            code: 'INVALID_PARAM',
          },
        })
      ),
    });

    const result = await submitVideoTask('test prompt', 5);

    expect(result).toEqual({
      taskId: null,
      status: 'error',
      message: '视频提示词格式错误（请使用纯文本）',
    });
  });

  it('handles network errors', async () => {
    (fetch as any).mockRejectedValueOnce(new Error('Network failed'));

    const result = await submitVideoTask('test prompt', 5);

    expect(result).toEqual({
      taskId: null,
      status: 'error',
      message: '网络错误',
    });
  });

  it('handles status polling', async () => {
    // Mock status response
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        status: 'succeeded',
        output: { video_url: 'https://example.com/video.mp4' },
      }),
    });

    const result = await getVideoTaskStatus('task-123');

    expect(result).toEqual({
      status: 'succeeded',
      videoUrl: 'https://example.com/video.mp4',
      message: '生成完成',
    });
  });
});

describe('Image Generation', () => {
  it('uses correct size parameters', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: [{ url: 'https://example.com/image.jpg' }],
      }),
    });

    await generateImage('test prompt', { ratio: '16:9' });

    const [[, options]] = (fetch as any).mock.calls;
    expect(JSON.parse(options.body).size).toBe('2560x1440');
  });

  it('handles image API errors', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: vi.fn().mockResolvedValue('Model not found'),
    });

    await expect(generateImage('test prompt')).rejects.toThrow(
      '图片生成失败: 400 Model not found'
    );
  });
});
