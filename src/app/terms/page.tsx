'use client';

import { useRouter } from 'next/navigation';
import { TopNav } from '@/components/TopNav';
import { BottomNav, type PageKey } from '@/components/BottomNav';

export default function TermsPage() {
  const router = useRouter();

  const handleNavigate = (page: PageKey, params?: string) => {
    switch (page) {
      case 'home': router.push('/home'); break;
      case 'inspiration': router.push('/inspiration'); break;
      case 'ai': router.push('/ai'); break;
      case 'hotspot': router.push('/hotspot'); break;
      case 'profile': router.push('/profile'); break;
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
      <TopNav title="用户服务协议" showBack onBack={() => router.push('/profile')} />
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
          用户服务协议
        </h1>
        <p style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', marginBottom: 40 }}>
          更新日期：2026年6月1日&nbsp;&nbsp;&nbsp;生效日期：2026年6月1日
        </p>

        <p style={{ marginBottom: 24 }}>
          欢迎使用「灵集」（以下简称&ldquo;本应用&rdquo;）。本协议是您与开发者（以下简称&ldquo;我们&rdquo;）之间就使用本应用所订立的协议。在使用本应用前，请您仔细阅读本协议全部条款。一旦您注册、使用或继续使用本应用，即视为您已充分理解并同意接受本协议全部条款的约束。
        </p>

        <Section title="一、服务说明">
          <ListItem>本应用是一款内容创作辅助工具，提供 AI 文案生成、AI 图片生成、AI 数字人视频、AI 配音、热点抓取、灵感库管理、日程提醒等功能。</ListItem>
          <ListItem>本应用通过接入第三方 AI 服务（包括但不限于 DeepSeek、字节跳动火山引擎、阿里云通义千问、OpenRouter）为您提供内容生成能力，相关功能依赖第三方服务的稳定性与可用性。</ListItem>
          <ListItem>本应用按&ldquo;现状&rdquo;提供，我们保留随时修改、暂停或终止部分功能的权利，且无需事先单独通知您。</ListItem>
        </Section>

        <Section title="二、账户注册与使用">
          <ListItem>您应使用本人真实有效的手机号码注册账户，并妥善保管账户信息。因您主动泄露或未尽到妥善保管义务造成的损失，由您本人承担。</ListItem>
          <ListItem>您理解并同意，短信验证码是登录与重置密码的重要凭证，请勿向他人透露。</ListItem>
          <ListItem>如发现账户被他人盗用或存在安全漏洞，请立即通过应用内反馈功能或本协议载明的联系方式通知我们。</ListItem>
          <ListItem>我们有权依据合理判断暂停或终止涉嫌违规的账户使用，并保留追究法律责任的权利。</ListItem>
        </Section>

        <Section title="三、用户行为规范">
          <p style={{ marginBottom: 12 }}>您承诺不得利用本应用从事以下行为：</p>
          <ListItem>违反国家法律法规，生成、传播任何违法违规内容，包括但不限于：煽动分裂国家、宣扬恐怖主义、传播淫秽色情、传播暴力血腥、侵害他人合法权益的内容。</ListItem>
          <ListItem>侵犯他人知识产权、名誉权、肖像权、隐私权等合法权益。</ListItem>
          <ListItem>利用 AI 生成功能制作虚假新闻、虚假宣传、欺诈或误导他人的内容。</ListItem>
          <ListItem>对应用进行反向工程、破解、批量爬取数据、攻击服务器等破坏行为。</ListItem>
          <ListItem>将本应用用于任何商业转售、二次售卖或其他未经授权的商业用途。</ListItem>
          <ListItem>其他违反公序良俗或本协议约定的行为。</ListItem>
          <p style={{ marginTop: 12 }}>如您违反上述约定，我们有权采取限制功能、暂停账户、删除内容、封禁账户等措施，并保留追究法律责任的权利。</p>
        </Section>

        <Section title="四、AI 生成内容的声明">
          <ListItem>本应用提供的 AI 生成内容（包括文案、图片、视频、配音）由人工智能模型基于您的输入生成，仅供您参考与个人使用。</ListItem>
          <ListItem>AI 生成内容可能存在不准确、不完整或与客观事实不符的情况，<strong style={{ color: '#FFFFFF' }}>不应作为专业意见、医疗诊断、法律咨询或投资决策的依据</strong>。</ListItem>
          <ListItem>对于您基于 AI 生成内容所做的任何决策与行为，由您本人承担全部责任。</ListItem>
          <ListItem>您使用本应用生成的原创性内容的知识产权归您所有；但您理解并同意，AI 生成结果可能与其他用户提交类似提示词后产生的内容存在相似性。</ListItem>
        </Section>

        <Section title="五、知识产权">
          <ListItem>本应用本身的代码、界面设计、Logo、商标、文案及非用户上传的内容，著作权归我们或合法授权方所有。</ListItem>
          <ListItem>本应用所引用的第三方商标、Logo、模型归各自权利人所有，仅在合理范围内使用。</ListItem>
          <ListItem>您在本应用上传或创作的内容，视为您拥有合法权利的内容。如发生第三方主张权利的情形，由您本人负责处理并承担全部责任。</ListItem>
        </Section>

        <Section title="六、付费服务（如适用）">
          <ListItem>本应用可能提供免费功能与付费会员功能，具体以应用内实际展示为准。</ListItem>
          <ListItem>付费服务一经开通，除法律明确规定的情形外，原则上不支持退款。</ListItem>
          <ListItem>我们保留调整服务价格、调整功能范围的权利，调整前将通过应用内通知或公告方式告知。</ListItem>
        </Section>

        <Section title="七、免责声明">
          <p>在法律允许的最大限度内，我们不对以下情况承担责任：</p>
          <ListItem>因不可抗力（包括但不限于自然灾害、网络服务商故障、第三方 AI 服务中断）导致的服务中断或数据丢失。</ListItem>
          <ListItem>因您设备故障、网络不稳定、误操作等原因导致的服务使用异常。</ListItem>
          <ListItem>第三方 AI 服务生成内容的准确性、完整性、合法性。</ListItem>
          <ListItem>其他用户在本应用发布的内容所引发的纠纷或损失。</ListItem>
        </Section>

        <Section title="八、协议变更与终止">
          <ListItem>我们有权根据业务发展、法律法规变更等情况适时修改本协议。修改后的协议一经发布即生效。</ListItem>
          <ListItem>如您不同意修改后的协议，可停止使用本应用并申请注销账户；继续使用即视为接受修改。</ListItem>
          <ListItem>您可随时通过应用内功能停止使用本应用。如需彻底删除账户及全部数据，请通过应用内反馈或本协议载明的联系方式联系我们。</ListItem>
          <ListItem>我们保留在合理范围内终止向您提供服务的权利，包括但不限于您严重违反本协议的情况。</ListItem>
        </Section>

        <Section title="九、适用法律与争议解决">
          <ListItem>本协议的订立、执行、解释及争议解决均适用中华人民共和国法律。</ListItem>
          <ListItem>因本协议产生的任何争议，双方应友好协商解决；协商不成的，任一方有权将争议提交至开发者所在地有管辖权的人民法院。</ListItem>
        </Section>

        <Section title="十、联系我们">
          <p style={{ marginBottom: 12 }}>如您对本协议有任何疑问、意见或建议，请通过以下方式联系我们：</p>
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 12,
            padding: '16px 20px',
            fontSize: 14,
          }}>
            <p style={{ marginBottom: 6 }}>邮箱：229888777@qq.com</p>
            <p style={{ marginBottom: 6 }}>应用网址：https://ai.zjsifan.com</p>
            <p>应用内：个人中心 → 帮助与反馈 → 意见反馈</p>
          </div>
          <p style={{ marginTop: 24, color: '#6B7280', fontSize: 13 }}>
            我们将在收到您反馈后的 15 个工作日内予以回复。
          </p>
        </Section>
      </div>
      <BottomNav activePage="profile" onNavigate={handleNavigate} />
    </div>
  );
}

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
