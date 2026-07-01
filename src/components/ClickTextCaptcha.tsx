"use client";
// 点击文字验证码组件
// 用法: <ClickTextCaptcha open={open} onClose={...} onSuccess={(captchaToken) => ...} />
// 流程:
//   1. 打开 → GET /api/captcha/click 拿底图 + 提示字 (按顺序的 3 个字)
//   2. 用户依次点击图中的目标字 → 收集 3 个点击坐标 (相对图片左上角)
//   3. 自动 POST /api/captcha/click 验证, 通过 → onSuccess(captchaToken)
//   4. 失败 → 抖动 + 重置点击 + 自动换一张

import { useEffect, useRef, useState } from "react";
import { X, RefreshCw, CheckCircle2 } from "lucide-react";

interface ClickTextCaptchaProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (captchaToken: string) => void;
}

interface ChallengeData {
  token: string;
  width: number;        // SVG 原始宽度
  height: number;       // SVG 原始高度
  bgImage: string;      // dataURL
  expected: string[];   // 提示字, 用户按顺序点
  expiresAt: string;
}

interface ClickRecord { x: number; y: number; idx: number; }

type Status = "loading" | "ready" | "verifying" | "success" | "error";

// 安全解析：服务端异常时可能返回空 body 或非 JSON，直接 res.json() 会抛
// "Unexpected end of JSON input"。这里兜底返回 {}，由调用方按 res.ok/status 处理。
async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function ClickTextCaptcha({ open, onClose, onSuccess }: ClickTextCaptchaProps) {
  const [data, setData] = useState<ChallengeData | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const [clicks, setClicks] = useState<ClickRecord[]>([]);
  const [shake, setShake] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);

  const loadChallenge = async () => {
    setStatus("loading");
    setError("");
    setClicks([]);
    try {
      const res = await fetch("/api/captcha/click", { method: "GET" });
      const json = await parseJsonSafe(res);
      if (!res.ok) throw new Error((json.error as string) || `加载失败 (HTTP ${res.status})`);
      setData(json as unknown as ChallengeData);
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
      setStatus("error");
    }
  };

  useEffect(() => {
    if (open && !data) loadChallenge();
    if (!open) {
      setData(null);
      setStatus("loading");
      setClicks([]);
      setError("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 有意省略依赖
  }, [open]);

  // 处理图片点击 (要把屏幕坐标换算成 SVG 原始坐标系)
  const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (status !== "ready" || !data) return;
    if (clicks.length >= data.expected.length) return;

    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    // 显示坐标 → SVG 原始坐标
    const scaleX = data.width / rect.width;
    const scaleY = data.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const idx = clicks.length;
    const next = [...clicks, { x, y, idx }];
    setClicks(next);

    // 集齐 → 提交
    if (next.length === data.expected.length) {
      setStatus("verifying");
      try {
        const res = await fetch("/api/captcha/click", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: data.token,
            clicks: next.map(c => ({ x: c.x, y: c.y })),
          }),
        });
        const json = await parseJsonSafe(res);
        if (!res.ok) {
          setStatus("error");
          setShake(s => s + 1);
          setError((json.error as string) || `验证失败 (HTTP ${res.status})`);
          setTimeout(() => loadChallenge(), 700);
          return;
        }
        setStatus("success");
        setTimeout(() => {
          onSuccess(json.captchaToken as string);
          onClose();
        }, 350);
      } catch (err) {
        setStatus("error");
        setShake(s => s + 1);
        setError(err instanceof Error ? err.message : "网络错误");
        setTimeout(() => loadChallenge(), 700);
      }
    }
  };

  const handleReset = () => {
    setClicks([]);
    setError("");
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-5"
        style={{
          background: "rgba(10, 22, 41, 0.95)",
          border: "1px solid rgba(255,255,255,0.15)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
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
        <div className="mb-3 flex items-center flex-wrap gap-2" style={{ fontSize: 13 }}>
          <span style={{ color: "#9CA3AF" }}>
            {status === "success" ? "✓ 验证通过" : "请依次点击:"}
          </span>
          {status !== "success" && data?.expected.map((c, i) => (
            <span
              key={i}
              className="px-2 py-0.5 rounded"
              style={{
                background: i < clicks.length
                  ? "rgba(16,185,129,0.2)"
                  : "rgba(59,130,246,0.2)",
                color: i < clicks.length ? "#10B981" : "#3B82F6",
                fontWeight: 700,
                fontSize: 14,
                border: `1px solid ${i < clicks.length ? "rgba(16,185,129,0.4)" : "rgba(59,130,246,0.4)"}`,
              }}
            >
              {i + 1}. {c}
            </span>
          ))}
        </div>

        {/* 图 */}
        <div
          className="relative rounded-lg overflow-hidden mb-3 select-none"
          style={{
            background: "rgba(0,0,0,0.3)",
            aspectRatio: data ? `${data.width} / ${data.height}` : "16 / 9",
            animation: shake > 0 ? `shake 0.4s` : "none",
          }}
          key={`bg-${shake}-${data?.token ?? "init"}`}
        >
          {data ? (
            <>
              <img
                ref={imgRef}
                src={data.bgImage}
                alt="点击文字"
                className="block w-full h-full"
                onClick={handleImageClick}
                style={{
                  cursor: status === "ready" ? "crosshair" : "default",
                  pointerEvents: status === "ready" ? "auto" : "none",
                }}
                draggable={false}
              />
              {/* 已点击标记 (相对图片定位, 用百分比) */}
              {clicks.map((c, i) => {
                const left = (c.x / data.width) * 100;
                const top = (c.y / data.height) * 100;
                return (
                  <div
                    key={i}
                    className="absolute pointer-events-none flex items-center justify-center rounded-full"
                    style={{
                      left: `${left}%`,
                      top: `${top}%`,
                      transform: "translate(-50%, -50%)",
                      width: 28,
                      height: 28,
                      background: "rgba(16,185,129,0.85)",
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 700,
                      border: "2px solid #fff",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                    }}
                  >
                    {i + 1}
                  </div>
                );
              })}
              {/* 状态遮罩 */}
              {status === "verifying" && (
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ background: "rgba(0,0,0,0.4)", color: "#fff", fontSize: 14 }}
                >
                  验证中...
                </div>
              )}
              {status === "success" && (
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ background: "rgba(16,185,129,0.4)", color: "#fff" }}
                >
                  <CheckCircle2 size={48} />
                </div>
              )}
            </>
          ) : (
            <div
              className="w-full h-full"
              style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <span style={{ color: "#6B7280", fontSize: 13 }}>
                {status === "error" ? error : "加载中..."}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between" style={{ minHeight: 20 }}>
          {error && status === "error" ? (
            <span style={{ color: "#EF4444", fontSize: 12 }}>{error}</span>
          ) : (
            <span style={{ color: "#6B7280", fontSize: 12 }}>
              {clicks.length}/{data?.expected.length ?? 3} 已点击
            </span>
          )}
          <div className="flex gap-2">
            {clicks.length > 0 && status === "ready" && (
              <button
                onClick={handleReset}
                className="px-2 py-1 rounded transition-colors hover:bg-white/10"
                style={{ color: "#9CA3AF", fontSize: 12 }}
              >
                重置
              </button>
            )}
            <button
              onClick={loadChallenge}
              className="flex items-center gap-1 px-2 py-1 rounded transition-colors hover:bg-white/10"
              style={{ color: "#9CA3AF", fontSize: 12 }}
            >
              <RefreshCw size={12} /> 换一批
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
      `}</style>
    </div>
  );
}
