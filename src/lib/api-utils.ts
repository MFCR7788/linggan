// API 工具函数
import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';

// 标准 API 响应包装器
export function createApiResponse<T>(data: T, message?: string): NextResponse<ApiResponse<T>> {
  return NextResponse.json({
    success: true,
    data,
    message
  });
}

export function createApiError(error: string, status: number = 500): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error
    },
    { status }
  );
}

export function createUnauthorizedResponse(): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error: '未授权访问'
    },
    { status: 401 }
  );
}

export function createNotFoundResponse(message: string = '资源不存在'): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error: message
    },
    { status: 404 }
  );
}

export function createPaginatedResponse<T>(
  data: T[],
  page: number,
  limit: number,
  total: number
): NextResponse {
  const totalPages = Math.ceil(total / limit);
  return NextResponse.json({
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      total_pages: totalPages
    }
  });
}

// 分页参数解析
export function getPaginationParams(searchParams: URLSearchParams): {
  page: number;
  limit: number;
  offset: number;
} {
  const rawPage = parseInt(searchParams.get('page') || '1', 10);
  const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
  const page = Math.min(Math.max(isNaN(rawPage) ? 1 : rawPage, 1), 1000);
  const limit = Math.max(1, Math.min(isNaN(rawLimit) ? 20 : rawLimit, 100));
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}
