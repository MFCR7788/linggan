import type { ToolDefinition } from '../../types';
import { fetchWeather } from '@/lib/ai-services';

export const getWeatherTool: ToolDefinition = {
  name: 'get_weather',
  description: '查询指定城市的实时天气信息。当用户询问天气、温度、是否需要带伞等时使用。',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: '城市名称，如"北京"、"上海"' },
    },
    required: ['city'],
  },
  async handler(params, _ctx) {
    const city = params.city as string;
    try {
      const weather = await fetchWeather(city);
      if (!weather) {
        return { success: false, output: `未能获取 ${city} 的天气信息。` };
      }
      return {
        success: true,
        output: `${city}天气：${weather.current.desc}，温度 ${weather.current.temp}°C，湿度 ${weather.current.humidity}%，风速 ${weather.current.windSpeed}km/h`,
        data: weather,
      };
    } catch (e) {
      return { success: false, output: '', error: `天气查询失败: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};
