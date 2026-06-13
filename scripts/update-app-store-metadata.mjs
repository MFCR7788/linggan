#!/usr/bin/env node
/**
 * 通过 App Store Connect API 更新灵集 App 元数据
 *
 * 用法:
 *   node scripts/update-app-store-metadata.mjs
 *   node scripts/update-app-store-metadata.mjs --submit
 */
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const API_KEY_ID = '52H698RFZF';
const ISSUER_ID = '1a2cb46c-d819-4e43-919c-4bb31e44f174';
const BUNDLE_ID = 'com.mfcr7788.lingji';
const KEY_FILE = path.join(REPO_ROOT, 'ios/fastlane/AuthKey_52H698RFZF.p8');
const BASE = 'https://api.appstoreconnect.apple.com/v1';

const APP_ID = '6777589423';
const VERSION_ID = '56e28b29-0e63-44e3-ae05-f04a63c70da0';
const LOCALIZATION_ID = '1c79b669-ade9-40cc-98df-1821f63d0cad';
const APP_INFO_LOC_ID = '28753a47-b00f-4719-95c5-8938b4db5a1b';
const APP_INFO_ID = 'baf93750-49bb-4e02-bc31-3cd97a3ce87a';
const BUILD_ID = '72e261f1-07b9-4c4b-aa8c-e82aae96114b';

// 元数据
const META_DIR = path.join(REPO_ROOT, 'ios/fastlane/metadata/zh-Hans');
const METADATA = {
  name: fs.readFileSync(path.join(META_DIR, 'name.txt'), 'utf8').trim(),
  subtitle: fs.readFileSync(path.join(META_DIR, 'subtitle.txt'), 'utf8').trim(),
  description: fs.readFileSync(path.join(META_DIR, 'description.txt'), 'utf8').trim(),
  keywords: fs.readFileSync(path.join(META_DIR, 'keywords.txt'), 'utf8').trim(),
  supportUrl: fs.readFileSync(path.join(META_DIR, 'support_url.txt'), 'utf8').trim(),
  marketingUrl: fs.readFileSync(path.join(META_DIR, 'marketing_url.txt'), 'utf8').trim(),
  privacyUrl: fs.readFileSync(path.join(META_DIR, 'privacy_url.txt'), 'utf8').trim(),
};

function getJWT() {
  const privateKey = fs.readFileSync(KEY_FILE, 'utf8');
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iss: ISSUER_ID, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' },
    privateKey,
    { algorithm: 'ES256', header: { kid: API_KEY_ID } }
  );
}

let token = getJWT();

async function api(method, path, body = null) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  let res = await fetch(`${BASE}${path}`, opts);
  if (res.status === 401) {
    token = getJWT();
    opts.headers.Authorization = `Bearer ${token}`;
    res = await fetch(`${BASE}${path}`, opts);
  }

  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  const submit = process.argv.includes('--submit');
  const phase = process.argv.includes('--phase2');

  console.log('=== 灵集 App Store Connect 元数据更新 ===\n');

  if (!phase) {
    // Phase 1: Basic metadata, review info, copyright
    await phase1();
  }

  if (phase) {
    // Phase 2: Categories, age rating, pricing, build association
    await phase2(submit);
  }

  console.log('\n=== 完成 ===');
}

async function phase1() {
  // 1. Update appStoreVersionLocalizations (description, keywords, URLs)
  console.log('1. 更新 App Store Version Localization...');
  let res = await api('PATCH', `/appStoreVersionLocalizations/${LOCALIZATION_ID}`, {
    data: {
      type: 'appStoreVersionLocalizations',
      id: LOCALIZATION_ID,
      attributes: {
        description: METADATA.description,
        keywords: METADATA.keywords,
        marketingUrl: METADATA.marketingUrl,
        supportUrl: METADATA.supportUrl,
        promotionalText: METADATA.subtitle,
      },
    },
  });
  console.log(`   ${res.ok ? '✅ OK' : '❌ FAILED'} (${res.status})`);
  if (!res.ok) console.log(`   ${JSON.stringify(res.data)}`);

  // 2. Update appInfoLocalizations (name, subtitle, privacyUrl)
  console.log('2. 更新 App Info Localization (名称/副标题/隐私URL)...');
  res = await api('PATCH', `/appInfoLocalizations/${APP_INFO_LOC_ID}`, {
    data: {
      type: 'appInfoLocalizations',
      id: APP_INFO_LOC_ID,
      attributes: {
        name: METADATA.name,
        subtitle: METADATA.subtitle,
        privacyPolicyUrl: METADATA.privacyUrl,
      },
    },
  });
  console.log(`   ${res.ok ? '✅ OK' : '❌ FAILED'} (${res.status})`);
  if (!res.ok) console.log(`   ${JSON.stringify(res.data)}`);

  // 3. Update copyright on version
  console.log('3. 更新 Copyright...');
  res = await api('PATCH', `/appStoreVersions/${VERSION_ID}`, {
    data: {
      type: 'appStoreVersions',
      id: VERSION_ID,
      attributes: {
        copyright: '© 2026 灵集',
      },
    },
  });
  console.log(`   ${res.ok ? 'OK' : 'FAILED'} (${res.status})`);
  if (!res.ok) console.log(`   ${JSON.stringify(res.data)}`);

  // 4. Create or update App Store Review Detail
  console.log('4. 设置审核信息...');
  // First check if it exists
  let reviewRes = await api('GET', `/appStoreVersions/${VERSION_ID}/appStoreReviewDetail`);
  const reviewExists = reviewRes.data?.data?.id;

  const reviewBody = {
    data: {
      type: 'appStoreReviewDetails',
      attributes: {
        contactFirstName: 'Yu',
        contactLastName: 'Weijun',
        contactPhone: '15967675767',
        contactEmail: '229888777@qq.com',
        demoAccountName: '18800000000',
        demoAccountPassword: '123456',
        demoAccountRequired: true,
        notes: '演示账号：手机号 18800000000，验证码 123456（测试环境固定值）。功能路径：1. 登录后进入首页 2. AI 创作 → AI 文案 → 选择素材 → 生成小红书文案 3. 热点 → 热点详情 → 一键转灵感。注意：首次打开请求通知权限可拒绝，不影响核心功能。短信验证码测试环境固定 123456。AI 生成境外节点偶有 2-3 秒延迟。',
      },
    },
  };

  if (reviewExists) {
    reviewBody.data.id = reviewExists;
    res = await api('PATCH', `/appStoreReviewDetails/${reviewExists}`, reviewBody);
  } else {
    reviewBody.data.relationships = {
      appStoreVersion: { data: { type: 'appStoreVersions', id: VERSION_ID } },
    };
    res = await api('POST', '/appStoreReviewDetails', reviewBody);
  }
  console.log(`   ${res.ok ? 'OK' : 'FAILED'} (${res.status})`);
  if (!res.ok) console.log(`   ${JSON.stringify(res.data)}`);

  // 5. Verify all Phase 1 updates
  console.log('5. 验证更新结果...');
  // Check loc
  let check = await api('GET', `/appStoreVersionLocalizations/${LOCALIZATION_ID}`);
  const loc = check.data?.data?.attributes;
  console.log(`   Description: ${loc?.description ? '✅ (' + loc.description.length + ' chars)' : '❌ empty'}`);
  console.log(`   Keywords: ${loc?.keywords || '❌ empty'}`);
  console.log(`   Support URL: ${loc?.supportUrl || '❌ empty'}`);
  console.log(`   Marketing URL: ${loc?.marketingUrl || '❌ empty'}`);

  // Check app info
  check = await api('GET', `/appInfoLocalizations/${APP_INFO_LOC_ID}`);
  const info = check.data?.data?.attributes;
  console.log(`   Name: ${info?.name || '❌ empty'}`);
  console.log(`   Subtitle: ${info?.subtitle || '❌ empty'}`);
  console.log(`   Privacy URL: ${info?.privacyPolicyUrl || '❌ empty'}`);

  // Check copyright
  check = await api('GET', `/appStoreVersions/${VERSION_ID}`);
  console.log(`   Copyright: ${check.data?.data?.attributes?.copyright || '❌ empty'} ${check.data?.data?.attributes?.copyright ? '✅' : '❌'}`);

  // Summary
  console.log('\n✅ Phase 1 完成。请运行 --phase2 设置分类、年龄分级、价格和 Build。');
}

async function phase2(submit) {
  // 5. Set categories
  console.log('5. 设置分类...');

  // Primary Category: PRODUCTIVITY
  let res = await api('PATCH', `/appInfos/${APP_INFO_ID}/relationships/primaryCategory`, {
    data: [{ type: 'appCategories', id: 'PRODUCTIVITY' }],
  });
  console.log(`   Primary (PRODUCTIVITY): ${res.ok ? 'OK' : 'FAILED'} (${res.status})`);
  if (!res.ok) console.log(`   ${JSON.stringify(res.data)}`);

  // Secondary Category: GRAPHICS_AND_DESIGN
  res = await api('PATCH', `/appInfos/${APP_INFO_ID}/relationships/secondaryCategory`, {
    data: [{ type: 'appCategories', id: 'GRAPHICS_AND_DESIGN' }],
  });
  console.log(`   Secondary (GRAPHICS_AND_DESIGN): ${res.ok ? 'OK' : 'FAILED'} (${res.status})`);
  if (!res.ok) console.log(`   ${JSON.stringify(res.data)}`);

  // 6. Age Rating Declaration
  console.log('6. 设置年龄分级 (4+)...');
  // Check if exists
  let ageRes = await api('GET', `/appInfos/${APP_INFO_ID}/ageRatingDeclaration`);
  const ageExists = ageRes.data?.data?.id;

  const ageBody = {
    data: {
      type: 'ageRatingDeclarations',
      attributes: {
        alcoholTobaccoOrDrugUseOrReferences: 'NONE',
        contests: 'NONE',
        gambling: false,
        gamblingAndContests: false,
        gamblingSimulated: 'NONE',
        kidsAgeBand: null,
        lootBox: false,
        medicalOrTreatmentInformation: 'NONE',
        messagingAndChat: 'NONE',
        profanityOrCrudeHumor: 'NONE',
        sexualContentGraphicAndNudity: 'NONE',
        sexualContentOrNudity: 'NONE',
        horrorOrFearThemes: 'NONE',
        matureOrSuggestiveThemes: 'NONE',
        unrestrictedWebAccess: false,
        userGeneratedContent: 'NONE',
        violenceCartoonOrFantasy: 'NONE',
        violenceRealisticProlongedGraphicOrSadistic: 'NONE',
        violenceRealistic: 'NONE',
        ageRatingOverride: 'NONE',
        ageRatingOverrideV2: 'NONE',
        koreaAgeRatingOverride: 'NONE',
      },
    },
  };

  if (ageExists) {
    ageBody.data.id = ageExists;
    res = await api('PATCH', `/ageRatingDeclarations/${ageExists}`, ageBody);
  } else {
    ageBody.data.relationships = {
      appInfo: { data: { type: 'appInfos', id: APP_INFO_ID } },
    };
    res = await api('POST', '/ageRatingDeclarations', ageBody);
  }
  console.log(`   ${res.ok ? 'OK' : 'FAILED'} (${res.status})`);
  if (!res.ok) console.log(`   ${JSON.stringify(res.data)}`);

  // 7. Price - set free
  console.log('7. 设置价格 (Free)...');

  // First create a price schedule if it doesn't exist
  let priceRes = await api('GET', `/apps/${APP_ID}/appPriceScheduleV2?include=manualPrices`);
  console.log(`   Price schedule check: ${priceRes.status}`);
  if (priceRes.data.errors) {
    // No price schedule yet - create one
    // App Store Connect API: POST /v1/appPriceSchedules
    res = await api('POST', '/appPriceSchedules', {
      data: {
        type: 'appPriceSchedules',
        relationships: {
          app: { data: { type: 'apps', id: APP_ID } },
          baseTerritory: { data: { type: 'territories', id: 'CHN' } },
          manualPrices: {
            data: [{
              type: 'appPrices',
              attributes: { startDate: null },
              relationships: {
                pricePoint: { data: { type: 'appPricePoints', id: '0' } }, // may not work
              },
            }],
          },
        },
      },
    });
    console.log(`   Create price schedule: ${res.ok ? 'OK' : 'FAILED'} (${res.status})`);
    if (!res.ok) console.log(`   ${JSON.stringify(res.data)}`);
  } else {
    // Update existing
    console.log(`   Existing price schedule: ${JSON.stringify(priceRes.data.data?.id)}`);
  }

  // 8. Associate build with version
  console.log('8. 关联 Build 到版本...');
  res = await api('PATCH', `/builds/${BUILD_ID}`, {
    data: {
      type: 'builds',
      id: BUILD_ID,
      relationships: {
        appStoreVersion: {
          data: { type: 'appStoreVersions', id: VERSION_ID },
        },
      },
    },
  });
  console.log(`   Build association: ${res.ok ? 'OK' : 'FAILED'} (${res.status})`);
  if (!res.ok) console.log(`   ${JSON.stringify(res.data)}`);

  // 9. Update encryption compliance on build
  console.log('9. 设置加密合规...');
  res = await api('PATCH', `/builds/${BUILD_ID}`, {
    data: {
      type: 'builds',
      id: BUILD_ID,
      attributes: {
        usesNonExemptEncryption: false,
      },
    },
  });
  console.log(`   Encryption: ${res.ok ? 'OK' : 'FAILED'} (${res.status})`);
  if (!res.ok) console.log(`   ${JSON.stringify(res.data)}`);

  // 10. Submit for review if requested
  if (submit) {
    console.log('10. 提交审核...');
    res = await api('POST', '/appStoreVersionSubmissions', {
      data: {
        type: 'appStoreVersionSubmissions',
        relationships: {
          appStoreVersion: {
            data: { type: 'appStoreVersions', id: VERSION_ID },
          },
        },
      },
    });
    console.log(`   Submit: ${res.ok ? 'OK' : 'FAILED'} (${res.status})`);
    if (!res.ok) console.log(`   ${JSON.stringify(res.data)}`);
  } else {
    console.log('10. 跳过提交 (使用 --submit 参数提交)');
  }
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
