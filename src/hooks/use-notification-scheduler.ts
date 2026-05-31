"use client";

import { useEffect, useRef } from "react";
import { useSchedules } from "./use-schedule";
import { scheduleNotification, cancelNotification } from "@/lib/notification-service";

function hashToNum(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 2147483647);
}

export function useNotificationScheduler() {
  const scheduledIdsRef = useRef<Set<number>>(new Set());

  const { data: upcomingSchedules } = useSchedules({
    status: "pending",
    limit: 100,
    startDate: new Date().toISOString(),
  });

  useEffect(() => {
    if (!upcomingSchedules || upcomingSchedules.length === 0) return;

    const newIds = new Set<number>();

    upcomingSchedules.forEach((schedule) => {
      const notifId = hashToNum(schedule.id);
      newIds.add(notifId);

      if (!scheduledIdsRef.current.has(notifId)) {
        const remindBefore = schedule.remind_before || 30;
        scheduleNotification({
          id: notifId,
          title: schedule.title,
          body:
            schedule.description ||
            `${new Date(schedule.scheduled_at).toLocaleString("zh-CN")} 开始`,
          scheduledAt: new Date(schedule.scheduled_at),
          remindBeforeMinutes: remindBefore,
        });
      }
    });

    // 清理已取消/已完成的日程通知
    scheduledIdsRef.current.forEach((id) => {
      if (!newIds.has(id)) {
        cancelNotification(id);
      }
    });

    scheduledIdsRef.current = newIds;
  }, [upcomingSchedules]);
}
