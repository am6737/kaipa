export interface RouteWeatherHour {
  time: string;
  code: number;
  temperature: number;
  rain: number | null;
  wind: number | null;
}
export interface RouteWeatherDay {
  date: string;
  code: number;
  min: number;
  max: number;
  rain: number | null;
  wind: number | null;
  sunrise: string | null;
  sunset: string | null;
  cloudCover: number | null;
  lowCloud: number | null;
  visibility: number | null;
  cloudBase: number | null;
  thunderstorm: number | null;
  dawnGlow: number | null;
  duskGlow: number | null;
  cape: number | null;
  showers: number | null;
  gust: number | null;
  dewPointSpread: number | null;
  feelsMin: number | null;
  feelsMax: number | null;
  hours: RouteWeatherHour[];
}
export interface RouteWeatherForecast { days: RouteWeatherDay[]; fetchedAt: string; }
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export function parseRouteWeather(input: unknown, fetchedAt = new Date().toISOString()): RouteWeatherForecast {
  const daily = (input as { daily?: Record<string, unknown> } | null)?.daily;
  if (!daily || !Array.isArray(daily.time)) throw new Error('Invalid forecast');
  const values = (key: string): unknown[] => Array.isArray(daily[key]) ? daily[key] as unknown[] : [];
  const min = values('temperature_2m_min'), max = values('temperature_2m_max'), feelsMin = values('apparent_temperature_min'), feelsMax = values('apparent_temperature_max'), code = values('weather_code');
  const rain = values('precipitation_probability_max'), wind = values('wind_speed_10m_max');
  const sunrise = values('sunrise'), sunset = values('sunset');
  const hourly = (input as { hourly?: Record<string, unknown> } | null)?.hourly;
  const hourlyValues = (key: string): unknown[] => Array.isArray(hourly?.[key]) ? hourly[key] as unknown[] : [];
  const hourlyTime = hourlyValues('time');
  const hourlyHours = (date: string): RouteWeatherHour[] => hourlyTime.flatMap((time, index) => {
    if (typeof time !== 'string' || time.slice(0, 10) !== date) return [];
    const temperature = hourlyValues('temperature_2m')[index];
    const code = hourlyValues('weather_code')[index];
    if (!finite(temperature) || !finite(code)) return [];
    const rainValue = hourlyValues('precipitation_probability')[index];
    const windValue = hourlyValues('wind_speed_10m')[index];
    return [{ time, code: code as number, temperature: temperature as number,
      rain: finite(rainValue) && (rainValue as number) >= 0 && (rainValue as number) <= 100 ? rainValue as number : null,
      wind: finite(windValue) && (windValue as number) >= 0 ? windValue as number : null }];
  });
  const byDate = (key: string, date: string, mode: 'avg' | 'max' = 'avg') => {
    const valuesForDate = hourlyTime.flatMap((time, index) => typeof time === 'string' && time.slice(0, 10) === date && finite(hourlyValues(key)[index]) ? [hourlyValues(key)[index] as number] : []);
    if (!valuesForDate.length) return null;
    return mode === 'max' ? Math.max(...valuesForDate) : valuesForDate.reduce((sum, value) => sum + value, 0) / valuesForDate.length;
  };
  const around = (key: string, date: string, event: unknown) => {
    if (typeof event !== 'string') return null;
    const target = Number(event.slice(11, 13)) + Number(event.slice(14, 16)) / 60;
    const valuesForDate = hourlyTime.flatMap((time, index) => {
      if (typeof time !== 'string' || time.slice(0, 10) !== date || !finite(hourlyValues(key)[index])) return [];
      const hour = Number(time.slice(11, 13)) + Number(time.slice(14, 16)) / 60;
      return Math.abs(hour - target) <= 1.01 ? [hourlyValues(key)[index] as number] : [];
    });
    return valuesForDate.length ? valuesForDate.reduce((sum, value) => sum + value, 0) / valuesForDate.length : null;
  };
  const glow = (date: string, event: unknown) => {
    const high = around('cloud_cover_high', date, event);
    const mid = around('cloud_cover_mid', date, event);
    const low = around('cloud_cover_low', date, event);
    const rain = around('precipitation_probability', date, event);
    const visibility = around('visibility', date, event);
    if (high == null || mid == null || low == null || rain == null) return null;
    const cloud = Math.max(0, 100 - Math.abs((high * 0.7 + mid * 0.3) - 50) * 1.5);
    return Math.max(0, Math.min(100, Math.round(cloud - low * 0.45 - rain * 1.1 + (visibility != null && visibility > 10000 ? 8 : 0))));
  };
  const days = daily.time.flatMap((date, index): RouteWeatherDay[] => {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !finite(min[index]) || !finite(max[index]) || !finite(code[index])) return [];
    const rainValue = finite(rain[index]) && (rain[index] as number) >= 0 && (rain[index] as number) <= 100 ? rain[index] as number : null;
    return [{ date, min: min[index] as number, max: max[index] as number, code: code[index] as number,
      rain: rainValue, wind: finite(wind[index]) && (wind[index] as number) >= 0 ? wind[index] as number : null,
      sunrise: typeof sunrise[index] === 'string' ? sunrise[index] as string : null,
      sunset: typeof sunset[index] === 'string' ? sunset[index] as string : null,
      cloudCover: byDate('cloud_cover', date), lowCloud: byDate('cloud_cover_low', date),
      visibility: byDate('visibility', date), cloudBase: byDate('cloud_base', date),
      thunderstorm: byDate('weather_code', date, 'max'),
      dawnGlow: glow(date, sunrise[index]), duskGlow: glow(date, sunset[index]),
      cape: byDate('cape', date, 'max'), showers: byDate('showers', date, 'max'), gust: byDate('wind_gusts_10m', date, 'max'),
      dewPointSpread: (() => { const temp = byDate('temperature_2m', date); const dew = byDate('dew_point_2m', date); return temp != null && dew != null ? temp - dew : null; })(),
      feelsMin: finite(feelsMin[index]) ? feelsMin[index] as number : null,
      feelsMax: finite(feelsMax[index]) ? feelsMax[index] as number : null,
      hours: hourlyHours(date), }];

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
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset&hourly=weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,cloud_base,precipitation_probability,temperature_2m,wind_speed_10m,dew_point_2m,cape,showers,wind_gusts_10m&wind_speed_unit=kmh&timezone=auto&forecast_days=15`;
}
