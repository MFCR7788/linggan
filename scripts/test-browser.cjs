// Playwright 自动化测试 — 灵集 V2.0.3 全功能测试
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3000';
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'screenshots');
const REPORT = [];

// 清空截图目录
if (fs.existsSync(SCREENSHOTS_DIR)) fs.rmSync(SCREENSHOTS_DIR, { recursive: true });
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

function result(test, passed, detail = '') {
  const r = { test, passed, detail };
  REPORT.push(r);
  console.log(`  ${passed ? '✅' : '❌'} ${test}${detail ? ': ' + detail : ''}`);
}

async function testPage(page, url, name, checks = []) {
  console.log(`\n📄 ${name} (${url})`);
  try {
    const resp = await page.goto(BASE + url, { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(2000); // 等客户端渲染

    // Check HTTP status
    if (resp && resp.status() >= 400) {
      result(`${name} - 页面加载`, false, `HTTP ${resp.status()}`);
      return;
    }

    // Check for error boundary
    const body = await page.textContent('body');
    if (body.includes('Application error') || body.includes('Something went wrong')) {
      result(`${name} - 页面加载`, false, '服务端报错');
      return;
    }
    result(`${name} - 页面加载`, true);

    // Run custom checks
    for (const check of checks) {
      try {
        const el = await page.waitForSelector(check.selector, { timeout: check.timeout || 3000 });
        if (el) {
          result(`${name} - ${check.label}`, true);
          if (check.action) await check.action(el);
        }
      } catch {
        result(`${name} - ${check.label}`, false, `未找到 "${check.selector}"`);
      }
    }

    // Check console errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // Take screenshot
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, `${name.replace(/[\/\s]/g, '_')}.png`),
      fullPage: true,
    });

  } catch (e) {
    result(`${name} - 异常`, false, e.message.substring(0, 100));
  }
}

(async () => {
  console.log('🚀 灵集 V2.0.3 全功能自动化测试\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 14 size
    deviceScaleFactor: 2,
    extraHTTPHeaders: {
      'x-forwarded-for': '127.0.0.1',
    },
  });

  // Set dev auth cookie
  await context.addCookies([{
    name: 'dev_user_id',
    value: 'test-user-001',
    domain: 'localhost',
    path: '/',
  }]);

  const page = await context.newPage();

  // ═══════════════════════════════════════
  // 一、登录 & 首页
  // ═══════════════════════════════════════
  console.log('━━━ 一、登录 & 首页 ━━━');

  await testPage(page, '/login', '登录页', [
    { selector: 'button', label: '登录按钮', timeout: 5000 },
  ]);

  await testPage(page, '/home', '首页', [
    { selector: 'text=灵感库', label: '底部导航' },
  ]);

  // ═══════════════════════════════════════
  // 二、AI 创作中心
  // ═══════════════════════════════════════
  console.log('\n━━━ 二、AI 创作中心 ━━━');

  await testPage(page, '/ai', 'AI创作中心', [
    { selector: 'text=AI 配音', label: 'AI配音卡片' },
    { selector: 'text=AI 视频', label: 'AI视频卡片' },
    { selector: 'text=AI 数字人', label: '数字人卡片' },
    { selector: 'text=9 宫格', label: '9宫格卡片' },
    { selector: 'text=AI 热点选题', label: '热点选题卡片' },
    { selector: 'text=多平台分发', label: '分发卡片' },
  ]);

  // 验证卡片顺序
  const cardOrder = await page.$$eval('.grid.grid-cols-3 button, .grid.grid-cols-3 > div', els =>
    els.map(e => e.textContent?.trim().split('\n')[0] || '').filter(Boolean)
  );
  console.log('  卡片顺序:', cardOrder.slice(0, 9).join(' → '));

  // ═══════════════════════════════════════
  // 三、AI 文案
  // ═══════════════════════════════════════
  console.log('\n━━━ 三、AI 文案 ━━━');

  await testPage(page, '/ai/copywriting', 'AI文案', [
    { selector: 'textarea, input[type="text"]', label: '输入框' },
  ]);

  // ═══════════════════════════════════════
  // 四、AI 图片
  // ═══════════════════════════════════════
  console.log('\n━━━ 四、AI 图片 ━━━');

  await testPage(page, '/ai/image', 'AI图片', [
    { selector: 'textarea, input', label: '输入框' },
  ]);

  // ═══════════════════════════════════════
  // 五、AI 图片编辑
  // ═══════════════════════════════════════
  console.log('\n━━━ 五、AI 图片编辑 ━━━');

  await testPage(page, '/ai/image-editor', 'AI图片编辑', [
    { selector: 'text=背景移除', label: '背景移除tab' },
    { selector: 'text=画质增强', label: '画质增强tab' },
    { selector: 'text=智能扩图', label: '智能扩图tab' },
  ]);

  // ═══════════════════════════════════════
  // 六、AI 配音 (TTS)
  // ═══════════════════════════════════════
  console.log('\n━━━ 六、AI 配音 ━━━');

  await testPage(page, '/ai/tts', 'AI配音', [
    { selector: 'textarea', label: '文本输入框' },
  ]);

  // ═══════════════════════════════════════
  // 七、AI 数字人
  // ═══════════════════════════════════════
  console.log('\n━━━ 七、AI 数字人 ━━━');

  await testPage(page, '/ai/digital-human', 'AI数字人', [
    { selector: 'text=一键成片', label: '一键成片tab' },
    { selector: 'text=手动配置', label: '手动配置tab' },
    { selector: 'text=批量生成', label: '批量生成tab' },
  ]);

  // 点击一键成片 tab 并测试输入
  try {
    await page.click('text=一键成片');
    await page.waitForTimeout(300);
    const ocInput = await page.$('input[placeholder*="主题"]');
    if (ocInput) {
      await ocInput.fill('测试主题：灵集功能介绍');
      result('数字人一键成片 - 主题输入', true);
    } else {
      result('数字人一键成片 - 主题输入', false, '未找到输入框');
    }
  } catch (e) {
    result('数字人一键成片 - 切换', false, e.message.substring(0, 80));
  }

  // ═══════════════════════════════════════
  // 八、AI 视频
  // ═══════════════════════════════════════
  console.log('\n━━━ 八、AI 视频 ━━━');

  await testPage(page, '/ai/video', 'AI视频', [
    { selector: 'button', label: '页面有按钮' },
  ]);

  // ═══════════════════════════════════════
  // 九、9 宫格
  // ═══════════════════════════════════════
  console.log('\n━━━ 九、9 宫格 ━━━');

  await testPage(page, '/ai/ads', '9宫格', [
    { selector: 'input, textarea', label: '输入框' },
  ]);

  // ═══════════════════════════════════════
  // 十、热点
  // ═══════════════════════════════════════
  console.log('\n━━━ 十、AI 热点选题 ━━━');

  await testPage(page, '/hotspot', '热点', [
    { selector: 'nav, button, div', label: '页面渲染' },
  ]);

  // ═══════════════════════════════════════
  // 十一、多平台分发
  // ═══════════════════════════════════════
  console.log('\n━━━ 十一、多平台分发 ━━━');

  await testPage(page, '/publish', '多平台分发', [
    { selector: 'button, textarea, input', label: '页面元素' },
  ]);

  // ═══════════════════════════════════════
  // 十二、灵感库
  // ═══════════════════════════════════════
  console.log('\n━━━ 十二、灵感库 ━━━');

  await testPage(page, '/inspiration', '灵感库', [
    { selector: 'div', label: '页面渲染' },
  ]);

  // ═══════════════════════════════════════
  // 十三-十五、其他页面
  // ═══════════════════════════════════════
  console.log('\n━━━ 十三-十五、其他页面 ━━━');

  await testPage(page, '/insights', '效果数据');
  await testPage(page, '/schedule', '排期');
  await testPage(page, '/profile', '我的');
  await testPage(page, '/profile/settings', '设置');
  await testPage(page, '/profile/help', '帮助');
  await testPage(page, '/profile/billing', '套餐');
  await testPage(page, '/profile/integrations', '集成');

  // ═══════════════════════════════════════
  // 边界测试
  // ═══════════════════════════════════════
  console.log('\n━━━ 边界测试 ━━━');

  // 测试空输入提交 (TTS)
  try {
    await page.goto(BASE + '/ai/tts', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    // 找到生成按钮并点击
    const genBtn = await page.$('button:has-text("生成")');
    if (genBtn) {
      await genBtn.click();
      await page.waitForTimeout(1000);
      const toastText = await page.textContent('body');
      if (toastText.includes('请输入') || toastText.includes('不能为空')) {
        result('边界 - TTS空输入', true, '有错误提示');
      } else {
        result('边界 - TTS空输入', false, '无错误提示');
      }
    }
  } catch (e) {
    result('边界 - TTS空输入', false, e.message.substring(0, 80));
  }

  // ═══════════════════════════════════════
  // 生成报告
  // ═══════════════════════════════════════
  const passed = REPORT.filter(r => r.passed).length;
  const failed = REPORT.filter(r => !r.passed).length;

  console.log(`\n\n═══════════════════════════════`);
  console.log(`  测试报告: ${passed} 通过 / ${failed} 失败 / ${REPORT.length} 总计`);
  console.log(`═══════════════════════════════`);

  if (failed > 0) {
    console.log(`\n❌ 失败项:`);
    REPORT.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.test}: ${r.detail}`);
    });
  }

  // 写入 JSON 报告
  fs.writeFileSync(
    path.join(SCREENSHOTS_DIR, 'report.json'),
    JSON.stringify({ passed, failed, total: REPORT.length, items: REPORT, timestamp: new Date().toISOString() }, null, 2)
  );

  console.log(`\n📸 截图已保存: ${SCREENSHOTS_DIR}`);

  await browser.close();
})();
