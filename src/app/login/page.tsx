"use client";
import { useState, useEffect } from "react";
import { Phone, Lock, User, MessageSquare, Sparkles, Mail, Smartphone } from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { GlassInput } from "@/components/GlassInput";
import { LoadingSpinner } from "@/components";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SliderCaptcha } from "@/components/SliderCaptcha";
import { useRouter } from "next/navigation";
import { useUser } from "@/hooks/use-user";
import { syncDevAuthCookie } from "@/lib/dev-auth";


function LoginContent() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState("");
  const [isLocalhost, setIsLocalhost] = useState(false);
  const [sliderOpen, setSliderOpen] = useState(false);
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
    // 弹出滑块验证码
    setSliderOpen(true);
  };

  const handleSliderSuccess = async (captchaToken: string) => {
    setIsSendingCode(true);
    setError("");

    try {
      const response = await fetch("/api/sms/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, captchaToken, type: tab }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error);
      }

      setError(data.message || "验证码已发送");
      setTimeout(() => setError(""), 3000);
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
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error);
      }

      // 设置会话
      if (data.session) {
        // 开发模式：保存用户信息到 localStorage
        localStorage.setItem('dev_user', JSON.stringify({
          id: data.session.user.id,
          phone: data.session.user.user_metadata.phone,
          username: data.session.user.user_metadata.username,
        }));

        // 同步 localStorage → cookie（确保 middleware 能读取）
        syncDevAuthCookie();

        // 使用硬导航确保 cookie 被正确发送
        window.location.href = "/home";
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
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error);
      }

      // 设置会话
      if (data.session) {
        // 开发模式：保存用户信息到 localStorage
        localStorage.setItem('dev_user', JSON.stringify({
          id: data.session.user.id,
          phone: data.session.user.user_metadata.phone,
          username: data.session.user.user_metadata.username,
        }));

        // 同步 localStorage → cookie（确保 middleware 能读取）
        syncDevAuthCookie();

        // 使用硬导航确保 cookie 被正确发送
        window.location.href = "/home";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败，请重试");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 relative">
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3"
          style={{
            background: "rgba(59,130,246,0.2)",
            border: "1px solid rgba(59,130,246,0.5)",
            boxShadow: "0 0 30px rgba(59,130,246,0.3)",
          }}
        >
          <Sparkles size={32} color="#3B82F6" />
        </div>
        <h1
          style={{
            color: "#FFFFFF",
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: 2,
          }}
        >
          灵集
        </h1>
        <p style={{ color: "#9CA3AF", fontSize: 13, marginTop: 4 }}>
          AI 灵感创作助手
        </p>
        
        {/* 测试模式提示 */}
        {isLocalhost && (
        <div
          className="mt-4 px-4 py-3 rounded-lg"
          style={{
            background: "rgba(34,197,94,0.1)",
            border: "1px solid rgba(34,197,94,0.3)",
          }}
        >
          <p style={{ color: "#22C55E", fontSize: 11, textAlign: "center" }}>
            🧪 本地测试模式
          </p>
          <p style={{ color: "#86EFAC", fontSize: 12, textAlign: "center", marginTop: 4 }}>
            发送验证码后，请使用 <strong>123456</strong> 进行登录/注册
          </p>
        </div>
        )}
      </div>

      <GlassCard className="w-full max-w-sm p-6">
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

        {error && (
          <div className="mb-4 p-3 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
            <p style={{ color: "#EF4444", fontSize: 12 }}>{error}</p>
          </div>
        )}

        {tab === "login" ? (
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
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
          <form onSubmit={handleRegister} className="flex flex-col gap-4">
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

      <p className="mt-6 text-center" style={{ color: "#9CA3AF", fontSize: 11 }}>
        登录即表示您同意{" "}
        <span style={{ color: "#3B82F6" }}>用户协议</span>
        {" "}和{" "}
        <span style={{ color: "#3B82F6" }}>隐私政策</span>
      </p>

      <SliderCaptcha
        open={sliderOpen}
        onClose={() => setSliderOpen(false)}
        onSuccess={handleSliderSuccess}
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
