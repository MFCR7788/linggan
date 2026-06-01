import { NextResponse } from 'next/server';
import { fetchWeather } from '@/lib/ai-services';

export const dynamic = 'force-dynamic';

export async function GET() {
  const results: Record<string, any> = {
    env: {
      HTTP_PROXY: process.env.HTTP_PROXY || '(not set)',
      http_proxy: process.env.http_proxy || '(not set)',
    },
    tests: {} as Record<string, any>,
  };

  for (const city of ['杭州', 'hangzhou', '北京']) {
    try {
      const data = await fetchWeather(city);
      results.tests[city] = data
        ? `${data.current.temp}°C, ${data.current.desc}`
        : 'null (失败)';
    } catch (e: any) {
      results.tests[city] = `异常: ${e.message}`;
    }
  }

  return NextResponse.json(results);
}
