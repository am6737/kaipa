export interface RouteWeatherDay {
  date: string;
  code: number;
  min: number;
  max: number;
  rain: number | null;
  wind: number | null;
}
export interface RouteWeatherForecast { days: RouteWeatherDay[]; fetchedAt: string; }
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export function parseRouteWeather(input: unknown, fetchedAt = new Date().toISOString()): RouteWeatherForecast {
  const daily = (input as { daily?: Record<string, unknown> } | null)?.daily;
  if (!daily || !Array.isArray(daily.time)) throw new Error('Invalid forecast');
  const values = (key: string): unknown[] => Array.isArray(daily[key]) ? daily[key] as unknown[] : [];
  const min = values('temperature_2m_min'), max = values('temperature_2m_max'), code = values('weather_code');
  const rain = values('precipitation_probability_max'), wind = values('wind_speed_10m_max');
  const days = daily.time.flatMap((date, index): RouteWeatherDay[] => {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !finite(min[index]) || !finite(max[index]) || !finite(code[index])) return [];
    return [{ date, min: min[index] as number, max: max[index] as number, code: code[index] as number,
      rain: finite(rain[index]) && (rain[index] as number) >= 0 && (rain[index] as number) <= 100 ? rain[index] as number : null,
      wind: finite(wind[index]) && (wind[index] as number) >= 0 ? wind[index] as number : null }];
  });
  if (!days.length) throw new Error('Empty forecast');
  return { days, fetchedAt };
}
export function weatherDescription(code: number, lang: 'zh' | 'en') {
  const labels = code === 0 ? ['晴', 'Clear'] : [1, 2, 3].includes(code) ? ['多云', 'Cloudy'] : [45, 48].includes(code) ? ['雾', 'Fog'] : [51, 53, 55, 56, 57, 61, 63, 65, 66, 67].includes(code) ? ['雨', 'Rain'] : [71, 73, 75, 77].includes(code) ? ['雪', 'Snow'] : [80, 81, 82].includes(code) ? ['阵雨', 'Showers'] : [85, 86].includes(code) ? ['阵雪', 'Snow showers'] : [95, 96, 99].includes(code) ? ['雷雨', 'Thunderstorm'] : ['未知', 'Unknown'];
  return labels[lang === 'zh' ? 0 : 1];
}
export function routeWeatherUrl(lng: number, lat: number) {
  if (!finite(lng) || !finite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) throw new Error('Invalid route coordinates');
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&wind_speed_unit=kmh&timezone=auto&forecast_days=3`;
}
