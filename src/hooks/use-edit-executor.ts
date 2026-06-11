// useEditExecutor — React hook：在浏览器中本地执行视频剪辑方案
// 基于 @ffmpeg/ffmpeg (ffmpeg.wasm)，纯本地，0 灵力

'use client';

import { useState, useRef, useCallback } from 'react';
import type { EditPlan, EditOperation } from '@/lib/agent/types';
import { planToFfmpegCommands, estimateDuration } from '@/lib/agent/edit-executor';
import type { ExecutorProgress } from '@/lib/agent/edit-executor';

export interface UseEditExecutorState {
  status: 'idle' | 'loading' | 'running' | 'done' | 'error';
  progress: ExecutorProgress | null;
  result: Blob | null;
  resultName: string;
  error: string | null;
  estimatedSeconds: number;
}

export function useEditExecutor() {
  const [state, setState] = useState<UseEditExecutorState>({
    status: 'idle',
    progress: null,
    result: null,
    resultName: '',
    error: null,
    estimatedSeconds: 0,
  });

  const workerRef = useRef<Worker | null>(null);
  const abortRef = useRef(false);

  const loadFFmpeg = useCallback(async () => {
    setState(s => ({ ...s, status: 'loading', error: null }));

    try {
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const { toBlobURL } = await import('@ffmpeg/util');

      const ffmpeg = new FFmpeg();

      ffmpeg.on('progress', ({ progress: p }) => {
        if (abortRef.current) return;
        setState(s => {
          if (s.progress) {
            return { ...s, progress: { ...s.progress, progress: Math.round(p * 100) } };
          }
          return s;
        });
      });

      ffmpeg.on('log', ({ message }) => {
        // 调试用，生产可关闭
        if (message.includes('Error') || message.includes('error')) {
          console.warn('[ffmpeg.wasm]', message);
        }
      });

      // 加载 ffmpeg core
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      return ffmpeg;
    } catch (e) {
      setState(s => ({
        ...s,
        status: 'error',
        error: `FFmpeg 加载失败: ${e instanceof Error ? e.message : String(e)}`,
      }));
      return null;
    }
  }, []);

  /**
   * 获取文件的实际字节数据（支持 File/Blob 对象和 URL 字符串）
   */
  const fetchFileData = useCallback(async (fileRef: string, files: Map<string, File | Blob>): Promise<Uint8Array | null> => {
    // 先查本地文件映射
    const local = files.get(fileRef);
    if (local) {
      return new Uint8Array(await local.arrayBuffer());
    }
    // 尝试作为 URL 获取
    if (fileRef.startsWith('http://') || fileRef.startsWith('https://') || fileRef.startsWith('blob:')) {
      const resp = await fetch(fileRef);
      if (resp.ok) {
        return new Uint8Array(await resp.arrayBuffer());
      }
    }
    return null;
  }, []);

  const execute = useCallback(async (
    plan: EditPlan,
    fileMap: Map<string, File | Blob>
  ): Promise<Blob | null> => {
    abortRef.current = false;
    setState({
      status: 'loading',
      progress: null,
      result: null,
      resultName: `${plan.output.label || 'output'}.${plan.output.format}`,
      error: null,
      estimatedSeconds: estimateDuration(plan),
    });

    const ffmpeg = await loadFFmpeg();
    if (!ffmpeg || abortRef.current) return null;

    const totalSteps = plan.operations.length;
    setState(s => ({ ...s, status: 'running', progress: { step: 0, totalSteps, label: '准备中...', progress: 0 } }));

    // 写入输入文件
    try {
      const inputNames = new Set<string>();
      for (const inp of plan.inputs) {
        inputNames.add(inp.name);
      }
      for (const op of plan.operations) {
        if (op.type === 'merge') {
          for (const s of op.sources) inputNames.add(s);
        } else if ('source' in op && typeof op.source === 'string') {
          inputNames.add(op.source);
        }
        if (op.type === 'audio_overlay' || op.type === 'audio_replace') {
          if (op.audioUrl.startsWith('http')) inputNames.add(op.audioUrl);
        }
      }

      for (const name of inputNames) {
        const data = await fetchFileData(name, fileMap);
        if (data) {
          const simpleName = name.split('/').pop() || name;
          await ffmpeg.writeFile(simpleName, data);
        }
      }
    } catch (e) {
      setState(s => ({
        ...s,
        status: 'error',
        error: `写入输入文件失败: ${e instanceof Error ? e.message : String(e)}`,
      }));
      return null;
    }

    // 逐步执行
    const commands = planToFfmpegCommands(plan);
    let lastOutput = plan.inputs[0]?.name || 'input.mp4';

    for (let i = 0; i < commands.length; i++) {
      if (abortRef.current) {
        setState(s => ({ ...s, status: 'idle', error: '已取消' }));
        return null;
      }

      const op = plan.operations[i];
      const label = op.label || `${op.type}`;

      setState(s => ({
        ...s,
        progress: { step: i, totalSteps, label, progress: 0 },
      }));

      try {
        await ffmpeg.exec(commands[i]);

        // 更新当前输出文件名
        const outputArg = commands[i][commands[i].length - 1];
        if (outputArg) lastOutput = outputArg;
      } catch (e) {
        setState(s => ({
          ...s,
          status: 'error',
          error: `步骤 "${label}" 执行失败: ${e instanceof Error ? e.message : String(e)}`,
        }));
        return null;
      }

      setState(s => ({
        ...s,
        progress: { step: i + 1, totalSteps, label: `${label} 完成`, progress: 100 },
      }));
    }

    // 读取最终输出
    try {
      const outputName = `${plan.output.label || 'output'}.${plan.output.format}`;
      const data = await ffmpeg.readFile(lastOutput || outputName);
      const blob = new Blob([data as BlobPart], { type: `video/${plan.output.format}` });

      setState(s => ({
        ...s,
        status: 'done',
        result: blob,
        resultName: outputName,
        progress: { step: totalSteps, totalSteps, label: '剪辑完成', progress: 100 },
      }));

      ffmpeg.terminate();
      return blob;
    } catch (e) {
      setState(s => ({
        ...s,
        status: 'error',
        error: `读取输出文件失败: ${e instanceof Error ? e.message : String(e)}`,
      }));
      return null;
    }
  }, [loadFFmpeg, fetchFileData]);

  const cancel = useCallback(() => {
    abortRef.current = true;
    setState(s => ({ ...s, status: 'idle', progress: null }));
  }, []);

  return { state, execute, cancel };
}
