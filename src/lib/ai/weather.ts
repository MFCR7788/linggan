// AI Services - Weather Query (wttr.in)

import type { WeatherData, WttrInCurrentCondition, WttrInDay, WttrInResponse } from './types';
import { WEATHER_USER_AGENT } from './types';

export async function fetchWeather(city: string): Promise<WeatherData | null> {
  try {
    const encodedCity = encodeURIComponent(city.trim());
    const url = `http://wttr.in/${encodedCity}?format=j1`;

    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
      || process.env.https_proxy || process.env.http_proxy
      || undefined;

    if (proxyUrl) {
      console.log('[Weather] 使用代理:', proxyUrl);
    }

    const headers: Record<string, string> = { 'User-Agent': WEATHER_USER_AGENT, 'Accept': 'application/json' };
    let res: Response;

    if (proxyUrl) {
      try {
        const { ProxyAgent } = await import('undici');
        res = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(15000),
          dispatcher: new ProxyAgent(proxyUrl),
        } as unknown as RequestInit);
      } catch {
        console.warn('[Weather] 无法加载 undici ProxyAgent, 将直连 wttr.in');
        res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      }
    } else {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    }
    if (!res.ok) return null;

    const data: WttrInResponse = await res.json();
    const current = data.current_condition?.[0];
    const weather = data.weather;

    if (!current) return null;

    return {
      city: city.trim(),
      current: {
        temp: Number(current.temp_C),
        feelsLike: Number(current.FeelsLikeC),
        desc: current.weatherDesc?.[0]?.value || '未知',
        humidity: Number(current.humidity),
        windSpeed: Number(current.windspeedKmph),
        cloudCover: Number(current.cloudcover),
      },
      forecast: (weather || []).slice(0, 3).map((day: WttrInDay) => ({
        date: day.date,
        maxTemp: Number(day.maxtempC),
        minTemp: Number(day.mintempC),
        desc: day.hourly?.[4]?.weatherDesc?.[0]?.value || '',
        sunrise: day.astronomy?.[0]?.sunrise || '',
        sunset: day.astronomy?.[0]?.sunset || '',
      })),
    };
  } catch (e) {
    console.error('[Weather] 获取天气失败:', e instanceof Error ? e.message : e);
    return null;
  }
}
