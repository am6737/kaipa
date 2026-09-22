export type FactField = { key: string; label: string; type?: 'text' | 'number' | 'select' | 'markdown'; required?: boolean; options?: string[]; unit?: string }
export type FactCategory = { slug: string; name: string; description?: string | null; field_schema: FactField[]; review_interval_days: number; sort_order: number }
export type RouteOption = { id: string; name: string; region?: string | null }

export type FactFormValues = {
  id?: string
  route_id: string
  category_slug: string
  title: string
  source_url: string
  review_due_at: string
  fields: Record<string, string>
}

export function serializeFactFields(schema: FactField[], values: Record<string, string>): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const field of schema) {
    const raw = (values[field.key] ?? '').trim()
    if (!raw) continue
    if (field.type === 'number') {
      const num = Number(raw)
      if (Number.isFinite(num)) out[field.key] = num
    } else {
      out[field.key] = raw
    }
  }
  return out
}
