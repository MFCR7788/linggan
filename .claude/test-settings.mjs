// 端到端测试 /profile/settings 页面
import { chromium } from '/Users/aplle/.npm-global/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs';

const CHROME_PATH = '/Users/aplle/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = 'http://localhost:3000';

const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
const context = await browser.newContext({ viewport: { width: 414, height: 896 } });
await context.addCookies([{
  name: 'dev_user_id', value: '11111111-1111-1111-1111-111111111111',
  domain: 'localhost', path: '/',
}]);
const page = await context.newPage();
const results = [];
const log = (m) => { console.log(m); results.push(m); };

page.on('pageerror', (err) => log(`❌ pageerror: ${err.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') log(`❌ console.error: ${msg.text()}`);
});

try {
  log('=== 1. /profile ===');
  await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/ss-1-profile.png' });

  log('=== 2. 点击"账号设置" ===');
  await page.getByText('账号设置', { exact: false }).first().click();
  await page.waitForURL('**/profile/settings', { timeout: 10000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/ss-2-settings.png' });
  log(`  URL: ${page.url()}`);

  log('=== 3. 4 个 section ===');
  for (const label of ['资料', '安全', '通知', '平台集成']) {
    const exists = await page.getByText(label, { exact: false }).first().isVisible().catch(() => false);
    log(`  ${label}: ${exists ? '✅' : '❌'}`);
  }

  log('=== 4. 修改昵称 ===');
  await page.getByRole('button', { name: /编辑/ }).first().click();
  await page.waitForTimeout(500);
  const usernameInput = page.locator('input[placeholder="昵称"]').first();
  await usernameInput.fill('浏览器E2E_2026');
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/ss-3-edit.png' });
  await page.getByRole('button', { name: /保存/ }).first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/ss-4-saved.png' });
  const hasNewName = await page.getByText('浏览器E2E_2026').first().isVisible().catch(() => false);
  log(`  昵称已更新: ${hasNewName ? '✅' : '❌'}`);

  log('=== 5. 修改密码 modal ===');
  await page.getByText('修改密码', { exact: false }).first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/ss-5-password-modal.png' });
  const modalTitle = await page.getByText('修改密码', { exact: false }).first().isVisible().catch(() => false);
  log(`  modal 打开: ${modalTitle ? '✅' : '❌'}`);
  const cancelBtn = page.getByRole('button', { name: '取消' }).first();
  if (await cancelBtn.isVisible().catch(() => false)) {
    await cancelBtn.click();
  }
  await page.waitForTimeout(500);

  log('=== 6. 退出所有设备 confirm ===');
  await page.getByText('退出所有设备', { exact: false }).first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/ss-6-signout-modal.png' });
  const confirmText = await page.getByText('退出所有设备？').first().isVisible().catch(() => false);
  log(`  confirm 弹出: ${confirmText ? '✅' : '❌'}`);
  await page.getByRole('button', { name: '取消' }).first().click();
  await page.waitForTimeout(500);

  log('=== 7. 6 个集成行 ===');
  for (const friendly of ['平台 Token 加密密钥', 'Cron 鉴权密钥', '微信公众号 AppID', '微信公众号 AppSecret', '微博 App Key', '微博 App Secret']) {
    const visible = await page.getByText(friendly, { exact: false }).first().isVisible().catch(() => false);
    log(`  ${friendly}: ${visible ? '✅' : '❌'}`);
  }

  log('=== 8. 跳到 /notification ===');
  await page.getByText('通知', { exact: false }).first().click();
  await page.waitForURL('**/notification', { timeout: 10000 });
  await page.waitForTimeout(1500);
  log(`  URL: ${page.url()}`);
  await page.screenshot({ path: '/tmp/ss-7-notification.png' });

  log('\n=== ALL DONE ===');
} catch (err) {
  log(`❌ FATAL: ${err.message}`);
  await page.screenshot({ path: '/tmp/ss-error.png' });
} finally {
  await browser.close();
  console.log('\n--- Result log ---');
  results.forEach(r => console.log(r));
}
