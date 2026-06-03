// 通知服务抽象层 — Capacitor 原生 + Web 回退

interface ScheduleNotificationParams {
  id: number;
  title: string;
  body: string;
  scheduledAt: Date;
  remindBeforeMinutes: number;
}

function isCapacitorAvailable(): boolean {
  try {
    return !!(window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

async function scheduleCapacitorNotification(params: ScheduleNotificationParams): Promise<void> {
  const { LocalNotifications } = await import('@capacitor/local-notifications');

  try {
    const permResult = await LocalNotifications.requestPermissions();
    if (permResult.display !== 'granted') return;
  } catch {
    // 权限请求失败，静默跳过
    return;
  }

  const triggerTime = new Date(
    params.scheduledAt.getTime() - params.remindBeforeMinutes * 60 * 1000
  );

  if (triggerTime.getTime() <= Date.now()) return;

  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: params.id,
        title: `📅 ${params.title}`,
        body: params.body,
        schedule: { at: triggerTime },
        sound: 'default',
        extra: {
          type: 'schedule_reminder',
          scheduleTime: params.scheduledAt.toISOString(),
        },
      }],
    });
  } catch {
    // 调度失败静默跳过
  }
}

function scheduleWebNotification(params: ScheduleNotificationParams): void {
  if (!('Notification' in window)) return;

  const delayMs =
    params.scheduledAt.getTime() -
    params.remindBeforeMinutes * 60 * 1000 -
    Date.now();

  if (delayMs <= 0 || delayMs > 7 * 24 * 3600 * 1000) return;

  (async () => {
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    if (Notification.permission !== 'granted') return;

    setTimeout(() => {
      try {
        new Notification(`日程提醒: ${params.title}`, {
          body: params.body,
          icon: '/icon-192.png',
          tag: `schedule-${params.id}`,
        });
      } catch { /* ignore */ }
    }, delayMs);
  })();
}

export async function scheduleNotification(params: ScheduleNotificationParams): Promise<void> {
  if (isCapacitorAvailable()) {
    return scheduleCapacitorNotification(params);
  }
  scheduleWebNotification(params);
}

export async function cancelNotification(id: number): Promise<void> {
  if (isCapacitorAvailable()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.cancel({ notifications: [{ id }] });
    } catch { /* ignore */ }
  }
}

export async function cancelAllNotifications(): Promise<void> {
  if (isCapacitorAvailable()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.cancel({ notifications: [] });
    } catch { /* ignore */ }
  }
}
