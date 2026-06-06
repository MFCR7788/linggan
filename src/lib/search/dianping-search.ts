// 大众点评搜索 — 本地商户精准搜索
// 抓取公开的 HTML 搜索页，提取商户卡片（店名/评分/地址/人均/推荐菜）
// 仅用于增强搜索精准度，不爬取用户评价内容

import axios from 'axios';
import * as cheerio from 'cheerio';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SearchResult } from './types';

const proxyUrl =
  process.env.HTTP_PROXY ||
  process.env.HTTPS_PROXY ||
  process.env.http_proxy ||
  process.env.https_proxy;

const dpAxios = axios.create(
  proxyUrl
    ? { timeout: 12000, httpsAgent: new HttpsProxyAgent(proxyUrl), proxy: false }
    : { timeout: 12000 },
);

const USER_AGENTS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

function getUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

class RateLimiter {
  private last = 0;
  constructor(private ms: number = 5000) {}
  async wait(): Promise<void> {
    const elapsed = Date.now() - this.last;
    if (elapsed < this.ms) await new Promise((r) => setTimeout(r, this.ms - elapsed));
    this.last = Date.now();
  }
}

const limiter = new RateLimiter(4000);

// ─── 搜索结果类型 ────────────────────────────────────

interface ShopCard {
  shopId: string;
  name: string;
  rating: string; // "4.5"
  reviewCount: string; // "128条"
  avgPrice: string; // "¥85/人"
  address: string;
  region: string;
  tags: string[];
  recommendedDishes: string[];
  url: string;
}

// ─── HTML 解析：大众点评移动版搜索页 ────────────────

function parseMobileSearchHtml(html: string): ShopCard[] {
  const shops: ShopCard[] = [];

  try {
    // 先尝试从 JSON 数据中提取（部分页面内嵌了 __PRELOADED_STATE__）
    const stateMatch = html.match(
      /window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/,
    );
    if (stateMatch) {
      try {
        const state = JSON.parse(stateMatch[1]);
        const list =
          state?.searchListData?.shopList ||
          state?.shopList ||
          state?.list ||
          [];
        if (Array.isArray(list) && list.length > 0) {
          return list
            .filter((s: any) => s.shopId || s.id)
            .map((s: any) => ({
              shopId: String(s.shopId || s.id || ''),
              name: s.shopName || s.name || '',
              rating: s.star ? String(s.star) : s.avgScore ? String(s.avgScore) : '',
              reviewCount: s.reviewCount ? String(s.reviewCount) : s.reviewNum ? `${s.reviewNum}条` : '',
              avgPrice: s.avgPrice ? `¥${s.avgPrice}/人` : s.priceText || '',
              address: s.address || s.regionName || '',
              region: s.regionName || s.areaName || '',
              tags: Array.isArray(s.tags) ? s.tags : s.categoryName ? [s.categoryName] : [],
              recommendedDishes: Array.isArray(s.recommendDishes) ? s.recommendDishes : [],
              url: s.shopUrl || `https://m.dianping.com/shop/${s.shopId || s.id}`,
            }));
        }
      } catch {
        // JSON 解析失败，回退到 HTML 模式
      }
    }

    // HTML 模式：解析搜索结果卡片
    const $ = cheerio.load(html);

    // 移动版商户卡片
    $('.shop-item, .shop-list-item, .shop-card, [class*="shop"]').each(
      (_, el) => {
        const $el = $(el);
        const name =
          $el.find('.shop-name, .poi-name, h3, [class*="title"]').text().trim() ||
          '';
        if (!name || name.length < 2) return;

        const href =
          $el.find('a[href*="shop"]').attr('href') ||
          $el.closest('a').attr('href') ||
          '';
        const shopIdMatch = href.match(/shop\/(\d+)/);
        const shopId = shopIdMatch ? shopIdMatch[1] : '';

        const rating =
          $el
            .find('.star-num, .score, [class*="star"], [class*="score"]')
            .text()
            .trim() || '';
        const reviewCount =
          $el
            .find('.review-count, .comment-num, [class*="review"]')
            .text()
            .trim() || '';
        const avgPrice =
          $el
            .find('.avg-price, .price, [class*="price"]')
            .text()
            .trim() || '';
        const address =
          $el
            .find('.address, .poi-addr, [class*="addr"], [class*="region"]')
            .text()
            .trim() || '';
        const region =
          $el
            .find('.region, .area, [class*="area"]')
            .text()
            .trim() || '';

        const tags: string[] = [];
        $el
          .find('.tag, .category-tag, [class*="tag"]')
          .each((_, t) => {
            const tag = $(t).text().trim();
            if (tag) tags.push(tag);
          });

        shops.push({
          shopId,
          name,
          rating,
          reviewCount,
          avgPrice,
          address: address || region,
          region,
          tags,
          recommendedDishes: [],
          url: shopId
            ? `https://m.dianping.com/shop/${shopId}`
            : `https://m.dianping.com/search/keyword/0_0_0/${encodeURIComponent(name)}`,
        });
      },
    );

    // PC 版商户卡片（回退）
    if (shops.length === 0) {
      $('.shop-list li, .J_shop_list li, .shop-wrap').each((_, el) => {
        const $el = $(el);
        const name =
          $el.find('h4, .shopname, .shop-name, .tit').text().trim() || '';
        if (!name || name.length < 2) return;

        const rating =
          $el
            .find('.sml-rank-stars, [class*="star"], [class*="score"]')
            .attr('title') ||
          $el
            .find('.sml-rank-stars, [class*="star"]')
            .text()
            .trim() ||
          '';
        const reviewCount =
          $el.find('.review-num, [class*="review"]').text().trim() || '';
        const avgPrice =
          $el.find('.mean-price, [class*="price"]').text().trim() || '';
        const address =
          $el.find('.addr, .address, .tag-addr').text().trim() || '';
        const href = $el.find('a[data-shopid]').attr('href') || '';
        const shopIdMatch = href.match(/shop\/(\d+)/);
        const dataId = $el.find('[data-shopid]').attr('data-shopid');

        shops.push({
          shopId: shopIdMatch?.[1] || dataId || name,
          name,
          rating,
          reviewCount,
          avgPrice,
          address,
          region: '',
          tags: [],
          recommendedDishes: [],
          url: shopIdMatch?.[1]
            ? `https://m.dianping.com/shop/${shopIdMatch[1]}`
            : `https://www.dianping.com/search/keyword/0_0_0/${encodeURIComponent(name)}`,
        });
      });
    }
  } catch (e) {
    console.warn('[Dianping] HTML parse error:', e);
  }

  return shops;
}

// ─── 主搜索函数 ────────────────────────────────────

export async function searchDianping(query: string): Promise<SearchResult[]> {
  await limiter.wait();

  const encodedKeyword = encodeURIComponent(query);
  // 同时请求 PC 和 Mobile 入口，先成功的先返回
  const urls = [
    `https://m.dianping.com/search/keyword/0_0_0/${encodedKeyword}`,
    `https://www.dianping.com/search/keyword/0_0_0/${encodedKeyword}`,
  ];

  for (const url of urls) {
    try {
      const res = await dpAxios.get(url, {
        headers: {
          'User-Agent': getUA(),
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          Referer: 'https://www.dianping.com/',
          'Cache-Control': 'no-cache',
        },
        maxRedirects: 3,
        validateStatus: (s) => s < 500, // 4xx 也算拿到了响应
      });

      const html = typeof res.data === 'string' ? res.data : String(res.data);

      // 被反爬特征：验证码页面 / 空白 / 403
      if (
        res.status === 403 ||
        html.includes('验证') ||
        html.includes('captcha') ||
        html.includes('请先登录') ||
        html.length < 500
      ) {
        continue; // 换下一个 URL
      }

      const shops = parseMobileSearchHtml(html);
      if (shops.length === 0) continue;

      console.log(`[Dianping] 找到 ${shops.length} 条商户结果: "${query}"`);
      return shops.map(
        (s): SearchResult => ({
          title: s.name,
          content: [
            s.rating ? `⭐${s.rating}` : '',
            s.reviewCount,
            s.avgPrice,
            s.address,
            s.tags.length > 0 ? s.tags.join(' · ') : '',
          ]
            .filter(Boolean)
            .join(' | '),
          url: s.url,
          source: 'dianping',
          sourceId: s.shopId,
        }),
      );
    } catch (e: any) {
      // 一个 URL 失败，尝试下一个
      if (e?.code === 'ECONNABORTED' || e?.code === 'ETIMEDOUT') {
        console.warn(`[Dianping] 超时: ${url}`);
      } else if (e?.response?.status) {
        console.warn(`[Dianping] HTTP ${e.response.status}: ${url}`);
      } else {
        console.warn(`[Dianping] 网络错误: ${e?.message || 'unknown'}`);
      }
    }
  }

  return [];
}
