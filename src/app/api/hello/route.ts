// 测试 API 端点
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    success: true,
    message: '灵集 API 正在运行！',
    version: '1.0.0'
  });
}
