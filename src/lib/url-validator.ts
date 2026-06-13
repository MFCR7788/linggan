// URL 安全校验：防止 SSRF（服务器端请求伪造）
// 仅允许 http/https 协议，阻止内网/保留 IP 和 localhost
import { lookup } from 'dns/promises';
import { isIP } from 'net';

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
  '[::]',
  '0',
]);

const BLOCKED_HOSTNAME_PATTERNS = [
  /\.local$/i,
  /\.internal$/i,
  /\.lan$/i,
  /\.home$/i,
  /\.corp$/i,
];

// IPv4 私有/保留地址段
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 127.0.0.0/8
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local)
  if (a === 169 && b === 254) return true;
  // 0.0.0.0/8
  if (a === 0) return true;
  // 100.64.0.0/10 (CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 224.0.0.0/4 (multicast)
  if (a >= 224 && a <= 239) return true;
  // 240.0.0.0/4 (reserved)
  if (a >= 240) return true;
  return false;
}

// IPv6 私有/保留地址段
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1') return true;             // loopback
  if (normalized === '::') return true;              // unspecified
  if (normalized.startsWith('fe80:')) return true;   // link-local
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local
  if (normalized.startsWith('ff')) return true;      // multicast
  if (normalized.startsWith('2001:db8:')) return true; // documentation
  return false;
}

// Web hook / metadata等服务:仅需 URL 解析即可，省去 DNS 查询
// 函数名及方法入参必须与 validatePublicUrl 保持一致，达到封装统一
export function validateUrlParsed(input: string): { valid: boolean; reason?: string; url: URL } {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { valid: false, reason: 'URL 格式无效', url: null as unknown as URL };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { valid: false, reason: '仅支持 http/https 协议', url };
  }

  const hostname = url.hostname.toLowerCase();

  if (BLOCKED_HOSTS.has(hostname)) {
    return { valid: false, reason: '禁止访问该主机', url };
  }

  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) {
      return { valid: false, reason: '禁止访问内网域名', url };
    }
  }

  // 如果 hostname 本身就是 IP，检查是否是私有 IP
  if (isIP(hostname)) {
    if (hostname.includes(':')) {
      if (isPrivateIPv6(hostname)) return { valid: false, reason: '禁止访问内网地址', url };
    } else {
      if (isPrivateIPv4(hostname)) return { valid: false, reason: '禁止访问内网地址', url };
    }
  }

  return { valid: true, url };
}

// 类似 validateUrlParsed，但还会解析 DNS 并校验结果的IP不能是私有的
export async function validatePublicUrl(input: string): Promise<{ valid: boolean; reason?: string; url: URL }> {
  const parsed = validateUrlParsed(input);
  if (!parsed.valid) return parsed;

  const { url } = parsed;
  const hostname = url.hostname.toLowerCase();

  // 已是 IP 地址则无需 DNS 解析（已在 validateUrlParsed 中检查）
  if (isIP(hostname)) {
    return { valid: true, url };
  }

  // DNS 解析并检查结果 IP
  try {
    const addresses = await lookup(hostname, { all: true });
    for (const addr of addresses) {
      const ip = addr.address;
      if (ip.includes(':')) {
        if (isPrivateIPv6(ip)) return { valid: false, reason: '域名解析到内网地址，拒绝访问', url };
      } else {
        if (isPrivateIPv4(ip)) return { valid: false, reason: '域名解析到内网地址，拒绝访问', url };
      }
    }
  } catch {
    return { valid: false, reason: '域名解析失败', url };
  }

  return { valid: true, url };
}
