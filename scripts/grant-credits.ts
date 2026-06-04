import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local
config({ path: resolve(__dirname, '../.env.local') });

async function main() {
  const { grant, getBalance } = await import('../src/lib/credits');

  const userId = '4bd17fdf-dfe9-4a15-8e3f-9f3a70be74a6'; // 13586108333

  try {
    const before = await getBalance(userId);
    console.log('操作前余额:', before);

    const result = await grant(userId, 1000, 'package_purchase', 'admin', '管理员充值 1000 credits（测试账号）', {
      operator: 'admin_cli',
    });
    console.log('充值结果:', result);

    const after = await getBalance(userId);
    console.log('操作后余额:', after);
  } catch (e) {
    console.error('充值失败:', e);
    process.exit(1);
  }
}

main();
