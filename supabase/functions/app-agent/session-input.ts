// Raw geometry remains in storage, not in repeated model context.
export function compactToolData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compactToolData);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['track_coords', 'track_elevation', 'track_file_url'].includes(key))
    .map(([key, data]) => [key, compactToolData(data)]));
}

// Old conversations may contain raw tracks sent before server-side parsing.
export function sanitizeSessionItem<T>(item: T): T {
  if (!item || typeof item !== 'object') return item;
  const record = { ...item } as Record<string, unknown>;
  if (record.role === 'user') {
    const stripSnapshots = (text: string) => {
      const boundary = text.indexOf('\n\n用户消息：');
      if (boundary < 0) return text;
      return text.slice(0, boundary).split('\n').filter((line) => !line.startsWith('本轮已检查的数据上下文：') && !line.startsWith('这些快照版本已核验') && !line.startsWith('本轮任务状态') && !line.startsWith('已确认交通信息') && !line.startsWith('A durable packing draft already exists')).join('\n') + text.slice(boundary);
    };
    if (typeof record.content === 'string') return { ...record, content: stripSnapshots(record.content) } as T;
    if (Array.isArray(record.content)) {
      record.content = record.content.map((part) => part && typeof part === 'object' && typeof part.text === 'string' ? { ...part, text: stripSnapshots(part.text) } : part);
    }
  }
  if (record.type === 'function_call_result') {
    const transform = (value: unknown): unknown => {
      if (typeof value === 'string') {
        try { return JSON.stringify(compactToolData(JSON.parse(value))); } catch { return value; }
      }
      if (value && typeof value === 'object' && 'text' in value) return { ...value, text: transform(value.text) };
      if (Array.isArray(value)) return value.map(transform);
      return compactToolData(value);
    };
    return { ...record, output: transform(record.output) } as T;
  }
  if (!Array.isArray(record.content)) return item;
  return { ...record, content: record.content.map(part => {
    if (!part || typeof part !== 'object') return part;
    if (part.type === 'input_file' && (/\.(gpx|kml|kmz)$/i.test(String(part.filename || ''))
      || /^data:application\/(gpx\+xml|vnd\.google-earth\.(kml\+xml|kmz))/i.test(String(part.file || '')))) {
      return { type: 'input_text', text: `已上传轨迹：${part.filename || '轨迹文件'}。原文件由后端保存，通过旅程工具读取轨迹。` };
    }
    return part;
  }) } as T;
}

export function compactHistoricalTools<T>(items: T[]): T[] {
  // Current state comes from revision-checked snapshots, never an old tool result.
  const stateTools = new Set(['get_app_context', 'get_journey_details', 'list_gear', 'estimate_personal_packing_needs']);
  return items.map((item) => {
    const clean = sanitizeSessionItem(item);
    if (!clean || typeof clean !== 'object') return clean;
    const record = clean as Record<string, unknown>;
    if (record.type === 'function_call_result' && stateTools.has(String(record.name))) {
      const text = JSON.stringify({ historical: true, note: '此历史数据快照已压缩。当前状态以本轮版本核验的数据上下文为准；缺失部分按需读取。' });
      return { ...record, output: typeof record.output === 'string' ? text : { type: 'text', text } } as T;
    }
    return clean;
  });
}
