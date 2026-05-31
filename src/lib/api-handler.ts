// API 路由处理抽象层
// 消除所有 API 路由中重复的 try-catch-auth 样板代码
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase-server";
import {
  createApiError,
  createUnauthorizedResponse,
} from "@/lib/api-utils";

type ApiContext = { params: Record<string, string> };

type HandlerContext = ApiContext & {
  request: NextRequest;
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
};

type PublicHandlerContext = ApiContext & {
  request: NextRequest;
  user?: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
};

type AuthenticatedHandler = (
  context: HandlerContext
) => NextResponse | Promise<NextResponse>;

type PublicHandler = (
  context: PublicHandlerContext
) => NextResponse | Promise<NextResponse>;

interface WrapperOptions {
  onError?: (error: unknown, request: NextRequest) => NextResponse;
}

/**
 * 包装需要认证的 API 路由处理函数
 * - 自动检查用户认证状态
 * - 自动包裹 try-catch 错误处理
 * - 返回一致的错误响应格式
 *
 * @example
 * export const GET = withAuth(async ({ request, user, params }) => {
 *   const data = await db.query().eq('user_id', user.id);
 *   return createApiResponse(data);
 * });
 *
 * // 带参数的路由
 * export const GET = withAuth(async ({ request, user, params }) => {
 *   const { id } = params;
 *   // ...
 * });
 */
export function withAuth(
  handler: AuthenticatedHandler,
  options?: WrapperOptions
) {
  return async (
    request: NextRequest,
    context?: { params: Record<string, string> }
  ): Promise<NextResponse> => {
    try {
      const user = await getCurrentUser();
      if (!user) {
        return createUnauthorizedResponse();
      }

      return await handler({
        ...(context || { params: {} }),
        request,
        user,
      });
    } catch (error) {
      console.error(
        `[API] ${request.method} ${request.nextUrl?.pathname || ""}:`,
        error
      );

      if (options?.onError) {
        return options.onError(error, request);
      }

      return createApiError("服务器错误", 500);
    }
  };
}

/**
 * 包装公开 API 路由处理函数
 * - 不强制要求认证，但 user 在已登录时可用
 * - 自动包裹 try-catch 错误处理
 *
 * @example
 * export const GET = withHandler(async ({ request }) => {
 *   return NextResponse.json({ status: "ok" });
 * });
 */
export function withHandler(
  handler: PublicHandler,
  options?: WrapperOptions
) {
  return async (
    request: NextRequest,
    context?: { params: Record<string, string> }
  ): Promise<NextResponse> => {
    try {
      let user: Awaited<ReturnType<typeof getCurrentUser>> = null;
      try {
        user = await getCurrentUser();
      } catch {
        // 公开路由忽略认证错误
      }

      return await handler({
        ...(context || { params: {} }),
        request,
        user: user || undefined,
      });
    } catch (error) {
      console.error(
        `[API] ${request.method} ${request.nextUrl?.pathname || ""}:`,
        error
      );

      if (options?.onError) {
        return options.onError(error, request);
      }

      return createApiError("服务器错误", 500);
    }
  };
}
