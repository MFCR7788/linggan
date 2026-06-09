import { ApiResponse } from "@/types";
import { syncDevAuthCookie, getDevUserIdHeader } from "./dev-auth";

class ApiClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor() {
    this.baseUrl = "/api";
    this.defaultHeaders = {
      "Content-Type": "application/json",
    };
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      // 每次请求前确保认证 cookie 已设置
      syncDevAuthCookie();

      const url = `${this.baseUrl}${endpoint}`;

      const response = await fetch(url, {
        ...options,
        credentials: 'include',
        headers: {
          ...this.defaultHeaders,
          ...getDevUserIdHeader(),
          ...options.headers,
        },
      });

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text().catch(() => '');
        throw new Error(`服务器返回非JSON响应 (${response.status}): ${text.substring(0, 100)}`);
      }

      const data = await response.json();

      if (!response.ok) {
        // 业务错误码:余额不足 → 全局派发事件,触发充值引导弹窗
        if (typeof window !== 'undefined' && data?.code === 'INSUFFICIENT_CREDITS') {
          window.dispatchEvent(new CustomEvent('credits:insufficient', {
            detail: {
              required: data?.data?.required ?? 0,
              available: data?.data?.available ?? 0,
              message: data?.error || '余额不足,请充值',
            },
          }));
        }
        return {
          success: false,
          error: data.error || `请求失败: ${response.status}`,
          code: data.code,
          data: data.data,
        };
      }

      // 成功后:如果响应里携带 balanceAfter / balance,派发 credits:updated 让横幅实时更新
      if (typeof window !== 'undefined' && data?.success) {
        const b = data?.data?.balanceAfter ?? data?.data?.balance;
        if (typeof b === 'number') {
          window.dispatchEvent(new CustomEvent('credits:updated', { detail: { balance: b } }));
        }
      }

      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "网络请求失败",
      };
    }
  }

  public async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "GET",
    });
  }

  public async post<T>(
    endpoint: string,
    data?: unknown
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  public async put<T>(
    endpoint: string,
    data?: unknown
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  public async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "DELETE",
    });
  }

  public async patch<T>(
    endpoint: string,
    data?: unknown
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "PATCH",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /** 文件上传（FormData，不设置 Content-Type 让浏览器自动处理） */
  public async upload<T>(
    endpoint: string,
    formData: FormData
  ): Promise<ApiResponse<T>> {
    syncDevAuthCookie();
    const url = `${this.baseUrl}${endpoint}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { ...getDevUserIdHeader() },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        return {
          success: false,
          error: data.error || `上传失败: ${response.status}`,
          code: data.code,
          data: data.data,
        };
      }
      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "网络请求失败",
      };
    }
  }
}

export const apiClient = new ApiClient();
