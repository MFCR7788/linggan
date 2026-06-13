#!/usr/bin/env node
/**
 * App Store 截图 - 本地 dev auth + 正确尺寸 (deviceScaleFactor: 1)
 * iPhone 6.5" = 1242 x 2688
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '../ios/fastlane/screenshots');

// deviceScaleFactor: 1 确保输出精确 1242×2688
const VIEWPORT = { width: 1242, height: 2688 };

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('启动浏览器 (viewport 1242×2688, scale 1)...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  // Dev auth on localhost
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('dev_user', JSON.stringify({ id: '00000000-0000-0000-0000-000000000001' }));
    document.cookie = 'dev_user_id=00000000-0000-0000-0000-000000000001; path=/';
  });
  await sleep(500);

  const pages = [
    ['/home', '01-homepage.png'],
    ['/ai/copywriting', '02-ai-creation.png'],
    ['/inspiration', '03-inspirations.png'],
    ['/hotspot', '04-hotspot.png'],
    ['/profile', '05-profile.png'],
  ];

  for (const [p, filename] of pages) {
    console.log(`\n截图: ${p} → ${filename}`);
    await page.goto('http://localhost:3000' + p, { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(5000);

    const filepath = path.join(OUTPUT_DIR, filename);
    await page.screenshot({ path: filepath });
    const stat = fs.statSync(filepath);
    console.log(`   ✅ ${filename} (${(stat.size / 1024).toFixed(1)} KB, ${stat.size} bytes)`);
  }

  await browser.close();
  console.log('\n✅ 完成！输出:', OUTPUT_DIR);
}

main();
