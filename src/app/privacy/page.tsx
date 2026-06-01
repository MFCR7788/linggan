import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '隐私政策 - 灵集',
  description: '灵集 App 隐私政策',
};

export default function PrivacyPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0A1629 0%, #1A365D 100%)',
      color: '#E5E7EB',
      fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      padding: '40px 20px 60px',
      lineHeight: 1.8,
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{
          color: '#FFFFFF',
          fontSize: 28,
          fontWeight: 700,
          marginBottom: 8,
          textAlign: 'center',
        }}>
          隐私政策
        </h1>
        <p style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', marginBottom: 40 }}>
          更新日期：2026年6月1日&nbsp;&nbsp;&nbsp;生效日期：2026年6月1日
        </p>

        <p style={{ marginBottom: 24 }}>
          欢迎使用「灵集」（以下简称&ldquo;我们&rdquo;或&ldquo;本应用&rdquo;）。我们深知个人信息对您的重要性，并会尽全力保护您的个人信息安全。本隐私政策旨在向您说明我们如何收集、使用、存储和保护您的个人信息，以及您所享有的相关权利。
        </p>

        {/* 1. 信息收集 */}
        <Section title="一、我们收集的信息">
          <SubSection title="1.1 您主动提供的信息">
            <ListItem>账户信息：手机号码，用于注册和登录。</ListItem>
            <ListItem>内容数据：您在灵感库中创建的文本、图片、视频、日程等内容。</ListItem>
            <ListItem>AI 生成内容：您使用 AI 文案、AI 图片、AI 数字人、AI 配音、AI 视频等功能时提交的提示词、参考素材和生成结果。</ListItem>
            <ListItem>反馈信息：您通过意见反馈功能提交的问题描述、建议和联系方式。</ListItem>
          </SubSection>
          <SubSection title="1.2 自动收集的信息">
            <ListItem>设备信息：设备型号、操作系统版本、唯一设备标识符。</ListItem>
            <ListItem>日志信息：应用使用情况、功能点击、错误日志。</ListItem>
            <ListItem>网络信息：IP 地址、网络类型。</ListItem>
          </SubSection>
          <SubSection title="1.3 权限申请">
            <ListItem>相机权限：用于拍照上传素材、AI 图片分析等功能。您可拒绝，仅影响相关功能使用。</ListItem>
            <ListItem>相册权限：用于选择和保存图片。您可拒绝，仅影响相关功能使用。</ListItem>
            <ListItem>通知权限：用于推送热点提醒、AI 生成完成通知等。您可在系统设置中随时关闭。</ListItem>
          </SubSection>
        </Section>

        {/* 2. 信息使用 */}
        <Section title="二、我们如何使用信息">
          <ListItem>提供、维护和优化本应用的核心功能。</ListItem>
          <ListItem>调用 AI 服务（DeepSeek、豆包大模型、豆包 TTS、Seedance 视频、Seedream 图片、阿里云通义千问、OpenRouter）处理您提交的内容，生成文案、图片、数字人视频、语音合成等结果。</ListItem>
          <ListItem>通过阿里云短信服务向您发送登录验证码。</ListItem>
          <ListItem>向您发送热点更新、AI 任务完成等与服务相关的通知。</ListItem>
          <ListItem>响应用户反馈，提供技术支持和客户服务。</ListItem>
          <ListItem>分析应用使用数据，改进产品体验和功能设计。</ListItem>
          <ListItem>保障账户安全和防范欺诈行为。</ListItem>
        </Section>

        {/* 3. 第三方服务 */}
        <Section title="三、第三方服务">
          <p style={{ marginBottom: 12 }}>
            为提供完整的服务，我们接入了以下第三方服务。这些第三方服务提供商可能会收集和处理您的部分数据，其隐私政策独立于本政策：
          </p>
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 12,
            padding: '16px 20px',
            fontSize: 13,
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 0', color: '#9CA3AF', fontWeight: 500 }}>第三方</th>
                  <th style={{ textAlign: 'left', padding: '8px 0', color: '#9CA3AF', fontWeight: 500 }}>用途</th>
                  <th style={{ textAlign: 'left', padding: '8px 0', color: '#9CA3AF', fontWeight: 500 }}>采集数据类型</th>
                  <th style={{ textAlign: 'left', padding: '8px 0', color: '#9CA3AF', fontWeight: 500 }}>存储区域</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '10px 0', color: '#FFFFFF' }}>Supabase</td>
                  <td style={{ padding: '10px 0' }}>用户认证、数据存储</td>
                  <td style={{ padding: '10px 0' }}>账户信息、内容数据</td>
                  <td style={{ padding: '10px 0' }}>境外</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '10px 0', color: '#FFFFFF' }}>字节跳动 · 豆包大模型</td>
                  <td style={{ padding: '10px 0' }}>AI 文案、多模态理解</td>
                  <td style={{ padding: '10px 0' }}>用户提示词、文本</td>
                  <td style={{ padding: '10px 0' }}>境内</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '10px 0', color: '#FFFFFF' }}>字节跳动 · 语音合成 TTS</td>
                  <td style={{ padding: '10px 0' }}>AI 配音功能</td>
                  <td style={{ padding: '10px 0' }}>待合成文本</td>
                  <td style={{ padding: '10px 0' }}>境内</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '10px 0', color: '#FFFFFF' }}>字节跳动 · Seedance/Seedream</td>
                  <td style={{ padding: '10px 0' }}>AI 视频/图片生成</td>
                  <td style={{ padding: '10px 0' }}>提示词、参考素材</td>
                  <td style={{ padding: '10px 0' }}>境内</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '10px 0', color: '#FFFFFF' }}>DeepSeek</td>
                  <td style={{ padding: '10px 0' }}>AI 文案生成、AI 分析</td>
                  <td style={{ padding: '10px 0' }}>用户提示词</td>
                  <td style={{ padding: '10px 0' }}>境外</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '10px 0', color: '#FFFFFF' }}>阿里云 DashScope（通义千问）</td>
                  <td style={{ padding: '10px 0' }}>AI 文本生成（备用）</td>
                  <td style={{ padding: '10px 0' }}>用户提示词</td>
                  <td style={{ padding: '10px 0' }}>境内</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '10px 0', color: '#FFFFFF' }}>OpenRouter</td>
                  <td style={{ padding: '10px 0' }}>热点抓取、多模型接入</td>
                  <td style={{ padding: '10px 0' }}>公开热点内容</td>
                  <td style={{ padding: '10px 0' }}>境外</td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '10px 0', color: '#FFFFFF' }}>阿里云</td>
                  <td style={{ padding: '10px 0' }}>短信验证码服务</td>
                  <td style={{ padding: '10px 0' }}>手机号码</td>
                  <td style={{ padding: '10px 0' }}>境内</td>
                </tr>
                <tr>
                  <td style={{ padding: '10px 0', color: '#FFFFFF' }}>Vercel</td>
                  <td style={{ padding: '10px 0' }}>应用托管与 CDN</td>
                  <td style={{ padding: '10px 0' }}>日志信息、IP 地址</td>
                  <td style={{ padding: '10px 0' }}>境外</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        {/* 4. 数据存储与安全 */}
        <Section title="四、数据存储与安全">
          <ListItem>您的账户数据、内容数据存储在 Supabase 提供的云数据库中（境外节点），加密静态保存。</ListItem>
          <ListItem>我们在境内为您提供 AI 服务时，会通过字节跳动火山引擎与阿里云完成数据处理，数据按其所在区域法律法规进行存储与保护。</ListItem>
          <ListItem>我们采用行业标准的加密传输协议（HTTPS/TLS）保护数据传输过程。</ListItem>
          <ListItem>我们采取访问控制、数据隔离等技术措施，防止未经授权的访问、使用或泄露。</ListItem>
          <ListItem>AI 生成过程中提交给第三方 API 的提示词和数据仅用于当次请求处理，不会被第三方用于模型训练。</ListItem>
          <ListItem>在发生数据安全事件时，我们将按照法律法规的要求及时通知您。</ListItem>
        </Section>

        {/* 5. 用户权利 */}
        <Section title="五、您的权利">
          <ListItem>访问权：您可以在个人中心查看您的账户信息和使用数据。</ListItem>
          <ListItem>更正权：您可以在个人中心修改账户信息，在灵感库中编辑或删除内容。</ListItem>
          <ListItem>删除权：您可以通过应用内功能删除灵感库内容、AI 生成记录。如需完全删除账户及所有数据，请联系我们。</ListItem>
          <ListItem>撤回同意：您可以在系统设置中随时撤回已授予的相机、相册、通知等权限。</ListItem>
          <ListItem>注销账户：您可以通过反馈功能或联系我们申请注销账户。账户注销后，我们将依法删除或匿名化处理您的个人信息。</ListItem>
        </Section>

        {/* 6. 未成年人保护 */}
        <Section title="六、未成年人保护">
          <p>
            本应用主要面向成年用户。如果您是未满 14 周岁的未成年人，请在监护人同意和指导下使用本应用。如果我们发现无意中收集了未成年人的个人信息，将立即删除相关数据。
          </p>
        </Section>

        {/* 7. 政策更新 */}
        <Section title="七、隐私政策更新">
          <p>
            我们可能会适时更新本隐私政策。当发生重大变更时，我们将通过应用内通知或短信等方式告知您。更新后的政策一经发布即生效，继续使用本应用即表示您同意更新后的政策。
          </p>
        </Section>

        {/* 8. 联系方式 */}
        <Section title="八、联系我们">
          <p style={{ marginBottom: 12 }}>
            如果您对本隐私政策有任何疑问、意见或建议，请通过以下方式联系我们：
          </p>
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 12,
            padding: '16px 20px',
            fontSize: 14,
          }}>
            <p style={{ marginBottom: 6 }}>邮箱：229888777@qq.com</p>
            <p style={{ marginBottom: 6 }}>在线客服：工作日 9:00 - 18:00</p>
            <p style={{ marginBottom: 6 }}>应用网址：https://linggan-two.vercel.app</p>
            <p>应用内：个人中心 → 帮助与反馈 → 意见反馈</p>
          </div>
          <p style={{ marginTop: 24, color: '#6B7280', fontSize: 13 }}>
            我们将在收到您反馈后的 15 个工作日内予以回复。
          </p>
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

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <h3 style={{
        color: '#93C5FD',
        fontSize: 14,
        fontWeight: 600,
        marginBottom: 8,
      }}>
        {title}
      </h3>
      <ul style={{ paddingLeft: 20, margin: 0 }}>
        {children}
      </ul>
    </div>
  );
}

function ListItem({ children }: { children: React.ReactNode }) {
  return (
    <li style={{
      color: '#D1D5DB',
      fontSize: 14,
      marginBottom: 6,
      listStyle: 'disc',
    }}>
      {children}
    </li>
  );
}
