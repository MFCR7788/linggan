import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local
config({ path: resolve(__dirname, '../.env.local') });

async function main() {
  const { grant, getBalance } = await import('../src/lib/credits');

  const args = process.argv.slice(2);
  const userId = args[0];
  const amount = parseInt(args[1], 10) || 1000;
  const desc = args[2] || `管理员充值 ${amount} credits`;

  if (!userId) {
    console.error('用法: npx tsx scripts/grant-credits.ts <userId> [amount] [description]');
    console.error('示例: npx tsx scripts/grant-credits.ts 4bd17fdf-dfe9-4a15-8e3f-9f3a70be74a6 500');
    process.exit(1);
  }

  try {
    const before = await getBalance(userId);
    console.log('操作前余额:', before);

    const result = await grant(userId, amount, 'package_purchase', 'admin', desc, {
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
