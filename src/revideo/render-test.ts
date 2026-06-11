// Revideo 渲染测试脚本（仅在 42 渲染服务器运行）
// 用法: npx tsx src/revideo/render-test.ts

import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const { renderVideo } = require('@revideo/renderer');

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser';
const PROJECT_FILE = path.resolve('src/revideo/project.ts');

interface TestCase {
  name: string;
  variables: Record<string, unknown>;
}

const testCases: TestCase[] = [
  {
    name: 'title-intro-purple',
    variables: {
      title: '灵集AI智能视频',
      subtitle: '一句话生成专业片头',
      accentColor: '#8B5CF6',
    },
  },
  {
    name: 'title-intro-blue',
    variables: {
      title: '内容创作新方式',
      subtitle: 'Revideo PoC',
      accentColor: '#3B82F6',
    },
  },
];

async function main() {
  console.log('Revideo 渲染测试开始...');
  console.log(`Project: ${PROJECT_FILE}`);
  console.log(`Chromium: ${CHROMIUM_PATH}\n`);

  for (const test of testCases) {
    console.log(`渲染: ${test.name}`);
    const startTime = Date.now();

    try {
      const outputPath = await renderVideo({
        projectFile: PROJECT_FILE,
        variables: test.variables,
        settings: {
          outFile: `${test.name}.mp4`,
          outDir: './output/revideo',
          logProgress: true,
          puppeteer: {
            executablePath: CHROMIUM_PATH,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
          },
          viteConfig: {
            server: {
              headers: {
                'Cross-Origin-Opener-Policy': 'same-origin',
                'Cross-Origin-Embedder-Policy': 'require-corp',
              },
            },
          },
        },
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  完成: ${outputPath} (${elapsed}s)\n`);
    } catch (err) {
      console.error(`  失败: ${err}\n`);
    }
  }

  console.log('测试完成!');
}

main().catch(console.error);
