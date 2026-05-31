// 开发模式认证工具

const DEV_USER_KEY = 'dev_user';
const DEV_COOKIE_NAME = 'dev_user_id';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

/** 从 localStorage 同步 dev_user_id 到 cookie */
export function syncDevAuthCookie(): void {
  if (typeof window === 'undefined') return;
  try {
    const stored = localStorage.getItem(DEV_USER_KEY);
    if (stored) {
      const user = JSON.parse(stored);
      if (user?.id) {
        document.cookie = `${DEV_COOKIE_NAME}=${user.id}; path=/; max-age=${COOKIE_MAX_AGE}; sameSite=lax`;
      }
    }
  } catch {
    // localStorage 可能不可用
  }
}

/** 从 localStorage 获取开发用户信息 */
export function getDevUser() {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(DEV_USER_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore
  }
  return null;
}

/** 获取 X-Dev-User-Id 请求头值 */
export function getDevUserIdHeader(): Record<string, string> {
  const devUser = getDevUser();
  if (devUser?.id) {
    return { 'X-Dev-User-Id': devUser.id };
  }
  return {};
}
