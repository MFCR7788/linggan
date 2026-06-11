// Minimal Revideo render test
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const { renderVideo } = require('@revideo/renderer');

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser';

async function main() {
  console.log('Minimal Revideo render test...');
  console.log(`Chromium: ${CHROMIUM_PATH}`);

  const projectFile = path.resolve('src/revideo/project-minimal.ts');

  try {
    const outputPath = await renderVideo({
      projectFile,
      settings: {
        outFile: 'minimal-test.mp4',
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

    console.log(`Success: ${outputPath}`);
  } catch (err) {
    console.error('Failed:', err);
  }
}

main();
