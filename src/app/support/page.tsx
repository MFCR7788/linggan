'use client';

import { useRouter } from 'next/navigation';
import { TopNav } from '@/components/TopNav';
import { type PageKey } from "@/components/BottomNav";
// Metadata must be exported from a separate layout or generateMetadata
// This page is client-rendered; for meta tags, wrap in a layout.ts

export default function SupportPage() {
  const router = useRouter();

  const handleNavigate = (page: PageKey, params?: string) => {
    switch (page) {
      case 'home': router.push('/home'); break;
      case 'inspiration': router.push('/inspiration'); break;
      case 'ai': router.push('/ai'); break;
      case 'hotspot': router.push('/hotspot'); break;
      case 'profile': router.push('/profile'); break;
      case 'agent': router.push('/agent'); break;
      case 'capture': router.push('/capture'); break;
      case 'login': router.push('/login'); break;
      default: router.push('/home');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0A1629 0%, #1A365D 100%)',
      color: '#E5E7EB',
      fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      lineHeight: 1.8,
    }}>
      <TopNav title="帮助与支持" showBack onBack={() => router.push('/profile')} />
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 20px 60px' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/brand/logo-mark.png" alt="灵集" style={{ width: 48, height: 48, margin: '0 auto 12px' }} />
        </div>
        <h1 style={{
          color: '#FFFFFF',
          fontSize: 28,
          fontWeight: 700,
          marginBottom: 8,
          textAlign: 'center',
        }}>
          帮助与支持
        </h1>
        <p style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', marginBottom: 40 }}>
          灵集 · 我们在这里
        </p>

        <Section title="联系我们">
          <p style={{ marginBottom: 16 }}>如有任何问题、建议或反馈，欢迎通过以下方式联系我们：</p>
          <ContactCard
            label="客服邮箱"
            value="229888777@qq.com"
            hint="我们将在 15 个工作日内回复"
            href="mailto:229888777@qq.com"
          />
          <ContactCard
            label="商务 / 媒体邮箱"
            value="support@lingji.app"
            hint="商务合作、媒体咨询请发此邮箱"
            href="mailto:support@lingji.app"
          />
          <ContactCard
            label="客服电话"
            value="400-0678-558"
            hint="在线客服时段：工作日 9:00 - 18:00"
            href="tel:4000678558"
          />
          <ContactCard
            label="客服手机"
            value="15967675767"
            hint="工作时间外可发送短信留言"
            href="tel:15967675767"
          />
          <ContactCard
            label="应用内反馈"
            value="个人中心 → 帮助与反馈 → 意见反馈"
            hint="提交后可直接看到回复"
          />
        </Section>

        <Section title="常见问题">
          <FAQ
            q="注册时收不到验证码怎么办？"
            a="请检查手机号是否输入正确，并查看短信拦截箱。如仍未收到，可等待 60 秒后重新获取或联系客服。"
          />
          <FAQ
            q="AI 生成内容失败如何处理？"
            a={'请检查网络连接是否稳定。如提示"服务暂时不可用"，稍后重试即可。如持续失败，请截图通过反馈功能提交给我们。'}
          />
          <FAQ
            q="灵感库数据存储在哪里？是否会丢失？"
            a="所有数据加密存储在 Supabase 云数据库中，会自动备份。不会因卸载 App 而丢失，可随时在新设备登录查看。"
          />
          <FAQ
            q="如何删除账户和所有数据？"
            a="应用内：个人中心 → 设置 → 注销账户。注销后所有数据将依法删除，且不可恢复，请提前导出重要内容。"
          />
          <FAQ
            q="付费会员包含哪些功能？"
            a="免费版已包含核心功能。未来将推出会员档，提供更高级 AI 模型、更长视频时长、更多音色等。详情请关注应用内公告。"
          />
        </Section>

        <Section title="相关链接">
          <LinkRow href="/privacy" label="隐私政策" desc="了解我们如何保护您的数据" />
          <LinkRow href="/terms" label="用户服务协议" desc="使用本应用的规则与条款" />
        </Section>

        <Section title="应用信息">
          <InfoRow label="应用名称" value="灵集" />
          <InfoRow label="版本" value="1.0.0" />
          <InfoRow label="应用网址" value="https://zjsifan.com" />
        </Section>
      </div>
      
    </div>
  );
}

// ─── 子组件 ──────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: 600,
        marginBottom: 16,
        paddingBottom: 8,
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ContactCard({ label, value, hint, href }: { label: string; value: string; hint: string; href?: string }) {
  const inner = (
    <>
      <p style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4 }}>{label}</p>
      <p style={{
        color: href ? '#60A5FA' : '#FFFFFF',
        fontSize: 14,
        marginBottom: 4,
        fontWeight: 500,
        textDecoration: href ? 'underline' : 'none',
      }}>{value}</p>
      <p style={{ color: '#6B7280', fontSize: 12 }}>{hint}</p>
    </>
  );
  const baseStyle: React.CSSProperties = {
    display: 'block',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: '14px 18px',
    marginBottom: 10,
    textDecoration: 'none',
  };
  if (href) {
    return <a href={href} style={baseStyle}>{inner}</a>;
  }
  return <div style={baseStyle}>{inner}</div>;
}

function FAQ({ q, a }: { q: string; a: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Q: {q}</p>
      <p style={{ color: '#D1D5DB', fontSize: 13, margin: 0 }}>A: {a}</p>
    </div>
  );
}

function LinkRow({ href, label, desc }: { href: string; label: string; desc: string }) {
  return (
    <a
      href={href}
      style={{
        display: 'block',
        background: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: '14px 18px',
        marginBottom: 10,
        textDecoration: 'none',
        color: '#E5E7EB',
      }}
    >
      <p style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{label} →</p>
      <p style={{ color: '#9CA3AF', fontSize: 12, margin: 0 }}>{desc}</p>
    </a>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      padding: '10px 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <span style={{ color: '#9CA3AF', fontSize: 13 }}>{label}</span>
      <span style={{ color: '#FFFFFF', fontSize: 13 }}>{value}</span>
    </div>
  );
}
