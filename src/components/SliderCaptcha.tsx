"use client";
// 滑块验证码组件
// 用法: <SliderCaptcha open={open} onClose={...} onSuccess={(captchaToken) => ...} />
// 流程:
//   1. 打开弹窗 → 调 GET /api/captcha/slider 拿底图+拼图块
//   2. 用户拖动滑块 → 实时显示当前 x 偏移
//   3. 释放鼠标 → POST /api/captcha/slider 验证
//   4. 验证通过 → 调 onSuccess(captchaToken), 父组件拿 token 调 send-code
//   5. 验证失败 → 抖动 + 自动刷新
import { useEffect, useRef, useState, useCallback } from "react";
import { X, RefreshCw, CheckCircle2 } from "lucide-react";

interface SliderCaptchaProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (captchaToken: string) => void;
}

interface CaptchaData {
  token: string;
  width: number;
  height: number;
  puzzleSize: number;
  puzzleY: number;
  bgImage: string;
  puzzleImage: string;
  expiresAt: string;
}

type Status = "loading" | "ready" | "dragging" | "verifying" | "success" | "error";

export function SliderCaptcha({ open, onClose, onSuccess }: SliderCaptchaProps) {
  const [data, setData] = useState<CaptchaData | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [shake, setShake] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startOffsetRef = useRef(0);

  // 加载新验证码
  const loadCaptcha = useCallback(async () => {
    setStatus("loading");
    setError("");
    setOffset(0);
    try {
      const res = await fetch("/api/captcha/slider", { method: "GET" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "加载失败");
      setData(json);
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (open && !data) loadCaptcha();
    if (!open) {
      setData(null);
      setStatus("loading");
      setOffset(0);
    }
  }, [open, data, loadCaptcha]);

  // 拖动
  const onPointerDown = (e: React.PointerEvent) => {
    if (status !== "ready") return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startXRef.current = e.clientX;
    startOffsetRef.current = offset;
    setStatus("dragging");
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (status !== "dragging") return;
    const dx = e.clientX - startXRef.current;
    const max = (data?.width ?? 400) - (data?.puzzleSize ?? 50);
    const next = Math.max(0, Math.min(max, startOffsetRef.current + dx));
    setOffset(next);
  };

  const onPointerUp = async (e: React.PointerEvent) => {
    if (status !== "dragging" || !data) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    setStatus("verifying");
    try {
      const res = await fetch("/api/captcha/slider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: data.token, x: offset }),
      });
      const json = await res.json();
      if (!res.ok) {
        // 失败: 抖动 + 重新加载
        setStatus("error");
        setShake((s) => s + 1);
        setError(json.error || "验证失败");
        setTimeout(() => loadCaptcha(), 800);
        return;
      }
      setStatus("success");
      setTimeout(() => {
        onSuccess(json.captchaToken);
        onClose();
      }, 400);
    } catch (err) {
      setStatus("error");
      setShake((s) => s + 1);
      setError(err instanceof Error ? err.message : "网络错误");
      setTimeout(() => loadCaptcha(), 800);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-5"
        style={{
          background: "rgba(10, 22, 41, 0.95)",
          border: "1px solid rgba(255,255,255,0.15)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 style={{ color: "#FFFFFF", fontSize: 16, fontWeight: 600 }}>
            安全验证
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="关闭"
          >
            <X size={20} color="#9CA3AF" />
          </button>
        </div>

        {/* 提示 */}
        <p style={{ color: "#9CA3AF", fontSize: 13, marginBottom: 12 }}>
          {status === "success" ? "✓ 验证通过" : "拖动滑块使拼图对齐缺口"}
        </p>

        {/* 底图 (含缺口) — 固定 400x200, 居中显示 */}
        <div className="flex justify-center mb-3">
          <div
            className="relative rounded-lg overflow-hidden"
            style={{
              background: "rgba(0,0,0,0.3)",
              width: data?.width ?? 400,
              height: data?.height ?? 200,
            }}
            key={`bg-${shake}-${data?.token ?? "init"}`}
          >
            {data ? (
              <>
                <img
                  src={data.bgImage}
                  alt="背景图"
                  className="block"
                  style={{ width: data.width, height: data.height }}
                />
                {/* 拼图块 (跟随滑块位置, 与缺口同 Y) */}
                {status !== "success" && (
                  <img
                    src={data.puzzleImage}
                    alt="拼图块"
                    className="pointer-events-none absolute"
                    style={{
                      top: data.puzzleY,
                      left: offset,
                      width: data.puzzleSize,
                      height: data.puzzleSize,
                      filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.5))",
                    }}
                  />
                )}
              </>
            ) : (
              <div
                className="w-full h-full"
                style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <span style={{ color: "#6B7280", fontSize: 13 }}>加载中...</span>
              </div>
            )}
          </div>
        </div>

        {/* 滑块轨道 */}
        <div
          ref={trackRef}
          className="relative rounded-lg overflow-hidden"
          style={{
            background: "rgba(255,255,255,0.06)",
            height: 44,
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {/* 进度条 */}
          <div
            className="absolute top-0 left-0 h-full transition-none"
            style={{
              width: offset,
              background: status === "success"
                ? "linear-gradient(90deg, #10B981, #059669)"
                : "linear-gradient(90deg, rgba(59,130,246,0.3), rgba(139,92,246,0.3))",
            }}
          />

          {/* 提示文字 */}
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ color: status === "success" ? "#10B981" : "#9CA3AF", fontSize: 13 }}
          >
            {status === "verifying" ? "验证中..." : status === "success" ? "验证成功" : `滑动滑块完成拼图 →`}
          </div>

          {/* 滑块按钮 */}
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="absolute top-0 h-full flex items-center justify-center touch-none select-none"
            style={{
              left: offset,
              width: 44,
              background: status === "success" ? "#10B981" : "linear-gradient(135deg, #3B82F6, #8B5CF6)",
              cursor: status === "ready" ? "grab" : status === "dragging" ? "grabbing" : "default",
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
              borderRadius: 6,
            }}
          >
            {status === "success" ? (
              <CheckCircle2 size={20} color="#FFFFFF" />
            ) : (
              <span style={{ color: "#FFFFFF", fontSize: 18, fontWeight: 700 }}>»</span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-3" style={{ minHeight: 20 }}>
          {error ? (
            <span style={{ color: "#EF4444", fontSize: 12 }}>{error}</span>
          ) : (
            <span style={{ color: "#6B7280", fontSize: 12 }}>
              {data ? `有效期至 ${new Date(data.expiresAt).toLocaleTimeString()}` : ""}
            </span>
          )}
          <button
            onClick={loadCaptcha}
            className="flex items-center gap-1 px-2 py-1 rounded transition-colors hover:bg-white/10"
            style={{ color: "#9CA3AF", fontSize: 12 }}
          >
            <RefreshCw size={12} /> 换一张
          </button>
        </div>
      </div>
    </div>
  );
}
