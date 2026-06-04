// 开发模式认证工具

const DEV_USER_KEY = 'dev_user';
const DEV_COOKIE_NAME = 'dev_user_id';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

interface DevUser {
  id: string;
}

/** 验证 dev user 对象结构 */
function isValidDevUser(obj: unknown): obj is DevUser {
  if (!obj || typeof obj !== 'object') return false;
  const u = obj as Record<string, unknown>;
  return typeof u.id === 'string' && u.id.length > 0;
}

/** 从 localStorage 同步 dev_user_id 到 cookie */
export function syncDevAuthCookie(): void {
  if (typeof window === 'undefined') return;
  try {
    const stored = localStorage.getItem(DEV_USER_KEY);
    if (!stored) return;
    const user = JSON.parse(stored);
    if (isValidDevUser(user)) {
      document.cookie = `${DEV_COOKIE_NAME}=${encodeURIComponent(user.id)}; path=/; max-age=${COOKIE_MAX_AGE}; sameSite=lax`;
    }
  } catch {
    // localStorage 可能不可用
  }
}

/** 从 localStorage 获取开发用户信息 */
export function getDevUser(): DevUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(DEV_USER_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return isValidDevUser(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 获取 X-Dev-User-Id 请求头值 */
export function getDevUserIdHeader(): Record<string, string> {
  const devUser = getDevUser();
  if (devUser?.id) {
    return { 'X-Dev-User-Id': devUser.id };
  }
  return {};
}
