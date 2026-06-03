/**
 * WeChat Pay V3 SDK (V2.0.4)
 *
 * 实现:
 * - 请求签名(RSA-SHA256)
 * - 回调签名验证(用平台公钥)
 * - 回调 payload 解密(AES-256-GCM,用 APIv3 Key)
 * - 平台证书拉取 + 内存缓存(12h)
 *
 * 微信支付 V3 API 文档:
 * https://pay.weixin.qq.com/wiki/doc/apiv3/wechatpay/wechatpay4_0.shtml
 */

import crypto from 'node:crypto';
import axios, { type AxiosResponse } from 'axios';

const API_BASE = 'https://api.mch.weixin.qq.com';

// ─── 环境变量(运行时读取,避免冷启动失败) ───
function getEnv() {
  const mchid = process.env.WECHAT_PAY_MCHID;
  const appid = process.env.WECHAT_PAY_APPID;
  const apiV3Key = process.env.WECHAT_PAY_API_V3_KEY;
  const serialNo = process.env.WECHAT_PAY_MCH_SERIAL_NO;
  const notifyUrl = process.env.WECHAT_PAY_NOTIFY_URL;
  const h5Domain = process.env.WECHAT_PAY_H5_DOMAIN;
  const privateKey = process.env.WECHAT_PAY_PRIVATE_KEY;
  if (!mchid || !appid || !apiV3Key || !serialNo || !notifyUrl || !h5Domain || !privateKey) {
    throw new Error('WeChat Pay 环境变量未完整配置(检查 7 个 WECHAT_PAY_* 变量)');
  }
  return { mchid, appid, apiV3Key, serialNo, notifyUrl, h5Domain, privateKey };
}

// ─── 平台证书缓存(serial → PEM 公钥) ───
let platformCertCache: { certs: Record<string, string>; fetchedAt: number } | null = null;
const PLATFORM_CERT_TTL_MS = 12 * 60 * 60 * 1000;  // 12h

// ─── 工具函数 ───
function nonceStr(len = 32): string {
  return crypto.randomBytes(len).toString('hex').slice(0, len);
}

function genOutTradeNo(prefix = 'LJ'): string {
  // 32 字符内,微信要求商户唯一
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(6).toString('hex');
  return `${prefix}${ts}${rand}`.toUpperCase().slice(0, 32);
}

// ─── 签名(请求时给 Authorization 头) ───
function sign(method: string, urlPath: string, body: string): string {
  const { mchid, serialNo, privateKey } = getEnv();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = nonceStr(16);
  const signStr = `${method.toUpperCase()}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signStr);
  const signature = signer.sign(privateKey, 'base64');
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${serialNo}"`;
}

// ─── 通用 V3 请求 ───
async function v3Request<T = unknown>(
  method: 'GET' | 'POST',
  urlPath: string,
  body?: Record<string, unknown>
): Promise<T> {
  const bodyStr = method === 'POST' && body ? JSON.stringify(body) : '';
  const authorization = sign(method, urlPath, bodyStr);
  const url = `${API_BASE}${urlPath}`;
  try {
    const res: AxiosResponse<T> = await axios({
      method,
      url,
      headers: {
        Authorization: authorization,
        Accept: 'application/json',
        'User-Agent': 'lingji-wechatpay/1.0',
        ...(bodyStr ? { 'Content-Type': 'application/json' } : {}),
        // 微信支付要求 Wechatpay-Serial 头(用于验证回调签名时可选指定)
      },
      data: bodyStr || undefined,
      timeout: 15000,
      validateStatus: () => true,
    });
    if (res.status >= 400) {
      const err = res.data as { code?: string; message?: string };
      throw new Error(`WeChat Pay ${method} ${urlPath} 失败 [${res.status}]: ${err?.code || ''} ${err?.message || JSON.stringify(err)}`);
    }
    return res.data;
  } catch (e: unknown) {
    if (e instanceof Error && 'response' in e) {
      const errWithResp = e as Error & { response?: { status: number; data: unknown } };
      throw new Error(`WeChat Pay ${method} ${urlPath} 网络失败: ${errWithResp.response?.status} ${JSON.stringify(errWithResp.response?.data)}`);
    }
    throw e;
  }
}

// ─── 平台证书拉取(用于验证回调签名) ───
async function fetchPlatformCerts(): Promise<Record<string, string>> {
  if (platformCertCache && Date.now() - platformCertCache.fetchedAt < PLATFORM_CERT_TTL_MS) {
    return platformCertCache.certs;
  }
  const { apiV3Key } = getEnv();
  const res: { data: Array<{ serial_no: string; encrypt_certificate: { algorithm: string; nonce: string; associated_data: string; ciphertext: string } }> } = await v3Request('GET', '/v3/certificates');
  const certs: Record<string, string> = {};
  for (const item of res.data) {
    const { algorithm, nonce, associated_data, ciphertext } = item.encrypt_certificate;
    if (algorithm !== 'AEAD_AES_256_GCM') continue;
    const pemCert = aesGcmDecrypt(ciphertext, nonce, associated_data, apiV3Key);
    certs[item.serial_no] = pemCert;
  }
  platformCertCache = { certs, fetchedAt: Date.now() };
  return certs;
}

// ─── AES-256-GCM 解密(用于回调 resource 解密 + 证书解密) ───
export function aesGcmDecrypt(ciphertextB64: string, nonce: string, associatedData: string, key: string): string {
  const ciphertextWithTag = Buffer.from(ciphertextB64, 'base64');
  // 微信 ciphertext 末尾 16 字节是 GCM auth tag
  const tagLength = 16;
  const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - tagLength);
  const authTag = ciphertextWithTag.subarray(ciphertextWithTag.length - tagLength);
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'utf8'), Buffer.from(nonce, 'utf8'));
  decipher.setAAD(Buffer.from(associatedData, 'utf8'));
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

// ─── 验证回调签名 ───
export async function verifyNotifySignature(
  timestamp: string,
  nonce: string,
  body: string,
  signature: string,
  serial: string
): Promise<boolean> {
  const certs = await fetchPlatformCerts();
  const pem = certs[serial];
  if (!pem) {
    // 强制重新拉取一次(可能是新签发的证书)
    platformCertCache = null;
    const refreshed = await fetchPlatformCerts();
    if (!refreshed[serial]) return false;
  }
  const verifyStr = `${timestamp}\n${nonce}\n${body}\n`;
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(verifyStr);
  const usedPem = platformCertCache?.certs[serial] || pem;
  return verifier.verify(usedPem, signature, 'base64');
}

// ─── H5 下单(浏览器外打开微信支付) ───
export interface H5OrderParams {
  outTradeNo: string;
  description: string;        // 商品描述(灵集 ¥XX 加油包)
  amountCents: number;        // 金额(分)
  attach?: string;            // 附加数据,会原样回调(放 userId/type 等)
  clientIp?: string;          // 用户客户端 IP
  sceneInfo?: {               // H5 场景信息
    type: 'iOS' | 'Android' | 'Wap';
    wapUrl?: string;
    wapName?: string;
  };
}

export async function createH5Order(params: H5OrderParams): Promise<{ h5_url: string }> {
  const { mchid, appid, notifyUrl, h5Domain } = getEnv();
  const body = {
    appid,
    mchid,
    description: params.description,
    out_trade_no: params.outTradeNo,
    notify_url: notifyUrl,
    amount: {
      total: params.amountCents,
      currency: 'CNY',
    },
    scene_info: {
      payer_client_ip: params.clientIp || '127.0.0.1',
      h5_info: {
        type: params.sceneInfo?.type || 'Wap',
        wap_url: params.sceneInfo?.wapUrl || `https://${h5Domain}/profile/billing`,
        wap_name: params.sceneInfo?.wapName || '灵集 LingJi',
      },
    },
    ...(params.attach ? { attach: params.attach } : {}),
  };
  return v3Request<{ h5_url: string }>('POST', '/v3/pay/transactions/h5', body);
}

// ─── 查询订单(回退用) ───
export interface QueryOrderResponse {
  appid: string;
  mchid: string;
  out_trade_no: string;
  transaction_id?: string;
  trade_type?: string;
  trade_state: 'SUCCESS' | 'REFUND' | 'NOTPAY' | 'CLOSED' | 'REVOKED' | 'USERPAYING' | 'PAYERROR';
  trade_state_desc: string;
  bank_type?: string;
  success_time?: string;
  payer?: { openid: string };
  amount?: { total: number; payer_total?: number; currency?: string };
}

export async function queryOrderByOutTradeNo(outTradeNo: string): Promise<QueryOrderResponse> {
  const { mchid } = getEnv();
  return v3Request<QueryOrderResponse>('GET', `/v3/pay/transactions/out-trade-no/${outTradeNo}?mchid=${mchid}`);
}

// ─── 关闭订单(用户长时间未支付) ───
export async function closeOrder(outTradeNo: string): Promise<void> {
  const { mchid } = getEnv();
  await v3Request('POST', `/v3/pay/transactions/out-trade-no/${outTradeNo}/close`, { mchid });
}

// ─── 工具:生成商户单号 ───
export { genOutTradeNo, nonceStr };
