"use client";
import { useState, useEffect } from "react";
import { Phone, Lock, User, MessageSquare, Mail, Smartphone } from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { GlassInput } from "@/components/GlassInput";
import { LoadingSpinner } from "@/components";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ClickTextCaptcha } from "@/components/ClickTextCaptcha";
import { useRouter } from "next/navigation";
import { usePageTitle } from "@/hooks/use-page-title";
import { useUser } from "@/hooks/use-user";


function LoginContent() {
  usePageTitle('登录');
  const [tab, setTab] = useState<"login" | "register">("login");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isLocalhost, setIsLocalhost] = useState(false);
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setIsLocalhost(window.location.hostname === 'localhost');
  }, []);
  const { data: user } = useUser();

  // 如果用户已登录，直接跳转到首页
  useEffect(() => {
    if (user) {
      router.push("/home");
    }
  }, [user, router]);

  // 倒计时
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendCode = () => {
    if (!phone || !phone.match(/^1[3-9]\d{9}$/)) {
      setError("请输入正确的手机号");
      return;
    }
    // 弹出点字验证码
    setCaptchaOpen(true);
  };

  const handleCaptchaSuccess = async (captchaToken: string) => {
    setIsSendingCode(true);
    setError("");

    try {
      const response = await fetch("/api/sms/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, captchaToken, type: tab }),
      });

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text().catch(() => '');
        throw new Error(`服务器异常 (${response.status}): ${text.substring(0, 80)}`);
      }
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error);
      }

      const msg = data.message || '验证码已发送';
      setSuccessMsg(data.code ? `${msg}（开发码: ${data.code}）` : msg);
      setError("");
      setTimeout(() => setSuccessMsg(""), 3000);
      setCountdown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送验证码失败");
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login-with-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });

      const loginContentType = response.headers.get('content-type') || '';
      if (!loginContentType.includes('application/json')) {
        const text = await response.text().catch(() => '');
        throw new Error(`服务器异常 (${response.status}): ${text.substring(0, 80)}`);
      }
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error);
      }

      // 设置会话（支持 Supabase session 和降级 JWT 两种模式）
      if (data.success) {
        const userId = data.session?.user?.id || data.user?.id;
        if (userId) {
          localStorage.setItem('dev_user', JSON.stringify({
            id: userId,
            phone: data.user?.phone || phone,
            username: data.user?.username || phone,
          }));
          window.location.href = "/home";
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败，请重试");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login-with-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, username }),
      });

      const regContentType = response.headers.get('content-type') || '';
      if (!regContentType.includes('application/json')) {
        const text = await response.text().catch(() => '');
        throw new Error(`服务器异常 (${response.status}): ${text.substring(0, 80)}`);
      }
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error);
      }

      // 设置会话（支持 Supabase session 和降级 JWT 两种模式）
      if (data.success) {
        const userId = data.session?.user?.id || data.user?.id;
        if (userId) {
          localStorage.setItem('dev_user', JSON.stringify({
            id: userId,
            phone: data.user?.phone || phone,
            username: data.user?.username || phone,
          }));
          window.location.href = "/home";
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败，请重试");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center px-6" style={{ paddingTop: 'max(60px, 10vh)', paddingBottom: 32 }}>
      {/* Logo */}
      <img
        src="/brand/logo-mark.png"
        alt="灵集"
        style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 12, marginBottom: 12 }}
      />
      <h1 style={{ color: "#FFFFFF", fontSize: 20, fontWeight: 700, letterSpacing: 2, margin: 0 }}>
        灵集
      </h1>
      <p style={{ color: "#9CA3AF", fontSize: 11, marginTop: 2 }}>
        AI 灵感创作助手
      </p>

      {/* 测试模式提示 */}
      {isLocalhost && (
        <div
          className="mt-3 px-3 py-1.5 rounded-lg"
          style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)" }}
        >
          <p style={{ color: "#22C55E", fontSize: 11, textAlign: "center", margin: 0 }}>
            🧪 本地测试模式 · 开发验证码可用
          </p>
        </div>
      )}

      <GlassCard className="w-full max-w-sm mt-5" style={{ padding: 20 }}>
        {/* Tab */}
        <div
          className="flex mb-6 rounded-xl overflow-hidden"
          style={{ background: "rgba(255,255,255,0.05)" }}
        >
          {(["login", "register"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setError("");
              }}
              className="flex-1 py-2.5 text-sm transition-all"
              style={{
                color: tab === t ? "#3B82F6" : "#9CA3AF",
                fontWeight: tab === t ? 600 : 400,
                borderBottom:
                  tab === t ? "2px solid #3B82F6" : "2px solid transparent",
              }}
            >
              {t === "login" ? "登录" : "注册"}
            </button>
          ))}
        </div>

        {successMsg && (
          <div className="mb-4 p-3 rounded-lg" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)" }}>
            <p style={{ color: "#22C55E", fontSize: 12 }}>{successMsg}</p>
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
            <p style={{ color: "#EF4444", fontSize: 12 }}>{error}</p>
          </div>
        )}

        {tab === "login" ? (
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <GlassInput
              icon={<Smartphone size={18} />}
              placeholder="请输入手机号"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={11}
              required
            />
            <div className="flex gap-3">
              <div className="flex-1">
                <GlassInput
                  icon={<MessageSquare size={18} />}
                  placeholder="请输入验证码"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={6}
                  required
                />
              </div>
              <button
                type="button"
                onClick={handleSendCode}
                disabled={isSendingCode || countdown > 0}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
                style={{
                  background: countdown > 0 ? "rgba(156, 163, 175, 0.2)" : "rgba(59,130,246,0.2)",
                  border: `1px solid ${countdown > 0 ? "rgba(156,163,175,0.3)" : "rgba(59,130,246,0.5)"}`,
                  color: countdown > 0 ? "#9CA3AF" : "#3B82F6",
                }}
              >
                {countdown > 0 ? `${countdown}s` : isSendingCode ? "发送中..." : "获取验证码"}
              </button>
            </div>
            <PrimaryButton fullWidth size="lg" type="submit" disabled={isLoading}>
              {isLoading ? <LoadingSpinner size="sm" /> : "登录"}
            </PrimaryButton>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="flex flex-col gap-3">
            <GlassInput
              icon={<Smartphone size={18} />}
              placeholder="请输入手机号"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={11}
              required
            />
            <GlassInput
              icon={<User size={18} />}
              placeholder="请设置用户名（可选）"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <div className="flex gap-3">
              <div className="flex-1">
                <GlassInput
                  icon={<MessageSquare size={18} />}
                  placeholder="请输入验证码"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={6}
                  required
                />
              </div>
              <button
                type="button"
                onClick={handleSendCode}
                disabled={isSendingCode || countdown > 0}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
                style={{
                  background: countdown > 0 ? "rgba(156,163,175,0.2)" : "rgba(59,130,246,0.2)",
                  border: `1px solid ${countdown > 0 ? "rgba(156,163,175,0.3)" : "rgba(59,130,246,0.5)"}`,
                  color: countdown > 0 ? "#9CA3AF" : "#3B82F6",
                }}
              >
                {countdown > 0 ? `${countdown}s` : isSendingCode ? "发送中..." : "获取验证码"}
              </button>
            </div>
            <PrimaryButton fullWidth size="lg" type="submit" disabled={isLoading}>
              {isLoading ? <LoadingSpinner size="sm" /> : "注册"}
            </PrimaryButton>
          </form>
        )}
      </GlassCard>

      <p className="mt-4 text-center" style={{ color: "#9CA3AF", fontSize: 11 }}>
        登录即表示您同意{" "}
        <span style={{ color: "#3B82F6" }}>用户协议</span>
        {" "}和{" "}
        <span style={{ color: "#3B82F6" }}>隐私政策</span>
      </p>

      <ClickTextCaptcha
        open={captchaOpen}
        onClose={() => setCaptchaOpen(false)}
        onSuccess={handleCaptchaSuccess}
      />
    </div>
  );
}

export default function LoginPage() {
  return (
    <ErrorBoundary>
      <LoginContent />
    </ErrorBoundary>
  );
}
