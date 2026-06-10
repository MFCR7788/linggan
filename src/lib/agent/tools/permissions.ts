// ToolPermissionManager — 工具权限控制
// 支持角色过滤、调用次数限制、用户确认

export interface ToolPermission {
  /** 工具名 */
  toolName: string;
  /** 是否需要用户确认 */
  requiresConfirmation: boolean;
  /** 允许使用的角色列表（空 = 所有人） */
  allowedRoles: string[];
  /** 每 session 最大调用次数（0 = 无限制） */
  maxCallsPerSession?: number;
}

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
  requiresConfirmation: boolean;
}

export class ToolPermissionManager {
  private permissions = new Map<string, ToolPermission>();
  private callCounts = new Map<string, Map<string, number>>(); // toolName → (sessionId → count)

  /** 设置工具权限 */
  setPermission(toolName: string, permission: Partial<Omit<ToolPermission, 'toolName'>>): void {
    const existing = this.permissions.get(toolName);
    this.permissions.set(toolName, {
      toolName,
      requiresConfirmation: permission.requiresConfirmation ?? existing?.requiresConfirmation ?? false,
      allowedRoles: permission.allowedRoles ?? existing?.allowedRoles ?? [],
      maxCallsPerSession: permission.maxCallsPerSession ?? existing?.maxCallsPerSession ?? 0,
    });
  }

  /** 批量设置 */
  setPermissions(permissions: ToolPermission[]): void {
    for (const p of permissions) {
      this.permissions.set(p.toolName, p);
    }
  }

  /** 获取工具权限配置 */
  getPermission(toolName: string): ToolPermission | undefined {
    return this.permissions.get(toolName);
  }

  /** 检查工具是否允许调用 */
  checkPermission(toolName: string, context: { userRole?: string; sessionId?: string }): PermissionResult {
    const perm = this.permissions.get(toolName);

    // 无配置 = 默认允许
    if (!perm) return { allowed: true, requiresConfirmation: false };

    // 角色检查
    if (perm.allowedRoles.length > 0 && context.userRole) {
      if (!perm.allowedRoles.includes(context.userRole)) {
        return { allowed: false, reason: `工具 ${toolName} 仅限 ${perm.allowedRoles.join(', ')} 角色使用`, requiresConfirmation: false };
      }
    }

    // 调用次数检查
    if (perm.maxCallsPerSession && perm.maxCallsPerSession > 0 && context.sessionId) {
      const sessionCounts = this.callCounts.get(toolName);
      const count = sessionCounts?.get(context.sessionId) ?? 0;
      if (count >= perm.maxCallsPerSession) {
        return { allowed: false, reason: `工具 ${toolName} 本会话已调用 ${count} 次（上限 ${perm.maxCallsPerSession}）`, requiresConfirmation: false };
      }
    }

    return { allowed: true, requiresConfirmation: perm.requiresConfirmation };
  }

  /** 记录工具调用 */
  recordCall(toolName: string, sessionId?: string): void {
    if (!sessionId) return;
    if (!this.callCounts.has(toolName)) {
      this.callCounts.set(toolName, new Map());
    }
    const sessionCounts = this.callCounts.get(toolName)!;
    sessionCounts.set(sessionId, (sessionCounts.get(sessionId) ?? 0) + 1);
  }

  /** 获取工具调用次数 */
  getCallCount(toolName: string, sessionId: string): number {
    return this.callCounts.get(toolName)?.get(sessionId) ?? 0;
  }

  /** 重置 session 调用计数 */
  resetSession(sessionId: string): void {
    for (const counts of this.callCounts.values()) {
      counts.delete(sessionId);
    }
  }

  /** 清除所有调用计数 */
  resetAll(): void {
    this.callCounts.clear();
  }
}
