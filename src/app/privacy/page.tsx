'use client';

import { useRouter } from 'next/navigation';
import { Shield, FileText, Database, Bell, Users, ExternalLink } from 'lucide-react';
import { GlassCard } from '@/components/GlassCard';
import { TopNav } from '@/components/TopNav';
import { type PageKey } from "@/components/BottomNav";
const sections = [
  {
    icon: <FileText size={18} />,
    title: '一、信息收集',
    content: '我们收集您主动提供的信息，包括：注册时的手机号码、个人资料（昵称、头像）；您使用 AI 创作工具时输入的主题、文案、图片、音频和视频等创作素材；以及您保存到灵感库的内容。',
  },
  {
    icon: <Database size={18} />,
    title: '二、信息使用',
    content: '您的信息仅用于以下目的：提供 AI 内容创作服务（文案生成、图片生成、视频生成、数字人生成、配音等）；维护和改善服务质量；响应您的客服请求；向您发送重要通知（如服务变更、安全提醒）。',
  },
  {
    icon: <Shield size={18} />,
    title: '三、信息存储与安全',
    content: '您的数据存储在 Supabase 提供的加密云数据库中。我们采用行业标准的加密传输（TLS/HTTPS）和安全存储措施保护您的数据。您上传的媒体文件存储在安全的云存储中，访问受权限控制。',
  },
  {
    icon: <Users size={18} />,
    title: '四、信息共享',
    content: '我们不会向第三方出售您的个人信息。以下情况除外：获得您的明确授权；为完成 AI 创作服务而向 AI 模型提供商（如阿里云、火山引擎）传输必要数据；法律法规要求披露。',
  },
  {
    icon: <Bell size={18} />,
    title: '五、您的权利',
    content: '您有权随时访问、更正、删除您的个人信息。您可以通过应用内的「账号设置」页面管理个人资料，通过「灵感库」管理您的内容。如需完全删除账号及所有数据，请联系客服。',
  },
  {
    icon: <ExternalLink size={18} />,
    title: '六、第三方服务',
    content: '本应用集成了以下第三方服务：阿里云 DashScope（AI 模型）、火山引擎豆包（AI 模型）、OpenRouter（AI 模型路由）、Supabase（数据库与存储）。这些服务各自遵循其隐私政策。',
  },
];

export default function PrivacyPage() {
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
    <div className="flex flex-col min-h-screen">
      <TopNav title="隐私政策" showBack onBack={() => router.push('/profile')} />
      <div className="px-4 pt-2 pb-4">
        <p style={{ color: '#9CA3AF', fontSize: 13 }}>
          灵集重视您的隐私。本隐私政策说明我们如何收集、使用和保护您的个人信息。
        </p>
        <p style={{ color: '#6B7280', fontSize: 11, marginTop: 4 }}>
          最后更新日期：2026 年 6 月 6 日
        </p>
      </div>

      <div className="flex-1 px-4 pb-8 space-y-3">
        {sections.map(({ icon, title, content }, index) => (
          <GlassCard key={index} className="!p-4">
            <div className="flex items-start gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{
                  background: 'rgba(59,130,246,0.15)',
                  border: '1px solid rgba(59,130,246,0.3)',
                }}
              >
                <span style={{ color: '#67E8F9' }}>{icon}</span>
              </div>
              <div>
                <h2 style={{ color: '#E5E7EB', fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
                  {title}
                </h2>
                <p style={{ color: '#9CA3AF', fontSize: 13, lineHeight: 1.7 }}>
                  {content}
                </p>
              </div>
            </div>
          </GlassCard>
        ))}

        <GlassCard className="!p-4">
          <h2 style={{ color: '#E5E7EB', fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
            七、联系我们
          </h2>
          <p style={{ color: '#9CA3AF', fontSize: 13, lineHeight: 1.7 }}>
            如果您对隐私政策有任何疑问，或希望行使您的数据权利，请通过以下方式联系我们：
          </p>
          <p style={{ color: '#67E8F9', fontSize: 13, marginTop: 8 }}>
            📧 privacy@lingji.app
          </p>
        </GlassCard>

        <p style={{ color: '#4B5563', fontSize: 11, textAlign: 'center', paddingTop: 12 }}>
          © 2026 灵集 LingJi. All rights reserved.
        </p>
      </div>
      
    </div>
  );
}
