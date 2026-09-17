import React, { useState } from 'react';

type TrendChartProps = { period: string; metric: string; points: number[] };

export function TrendChart({ period, metric, points }: TrendChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const values = points.map((value, index) => (metric === '新增用户' ? value : Math.round(value * .56 + index % 3 * 8)) * 2);
  const dates = period === '7'
    ? ['08.31', '09.01', '09.02', '09.03', '09.04', '09.05', '09.06']
    : ['08.08', '08.11', '08.14', '08.17', '08.20', '08.23', '08.26', '08.29', '09.01', '09.06'];
  const coordinates = values.map((value, index) => `${index / (values.length - 1) * 600},${140 - value / 200 * 140}`).join(' ');
  return <div className="trend-chart" role="group" aria-label={`${metric}最近 ${period} 天增长趋势`}>
    <div className="trend-axis" aria-hidden="true">{[200, 150, 100, 50, 0].map(value => <span key={value}>{value}</span>)}</div>
    <div className="trend-plot">
      <svg viewBox="0 0 600 140" preserveAspectRatio="none" aria-hidden="true">
        {[0, 35, 70, 105, 140].map(y => <line key={y} x1="0" x2="600" y1={y} y2={y} className="trend-grid" />)}
        <polyline points={coordinates} className="trend-line" />
      </svg>
      {values.map((value, index) => <div className={`trend-point ${active === index ? 'active' : ''}`} key={index} style={{ left: `${index / (values.length - 1) * 100}%`, top: `${100 - value / 200 * 100}%` }}>
        <button className="trend-hit" aria-label={`${dates[index]} ${metric} ${value}`} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} onClick={() => setActive(index)}><i /></button>
        <span className={`trend-tooltip ${index === 0 ? 'start' : index === values.length - 1 ? 'end' : ''}`} aria-hidden="true"><span>{dates[index]}</span><strong>{value}</strong></span>
      </div>)}
      <div className="trend-dates" aria-hidden="true">{dates.map((date, index) => <span key={date} style={{ left: `${index / (values.length - 1) * 100}%` }}>{period === '7' || index % 2 === 0 || index === dates.length - 1 ? date : ''}</span>)}</div>
    </div>
  </div>;
}
