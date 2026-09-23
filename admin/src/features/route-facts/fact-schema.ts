export type FactField = { key: string; label: string; type?: 'text' | 'number' | 'select' | 'markdown'; required?: boolean; options?: string[]; unit?: string }
export type FactCategory = { slug: string; name: string; description?: string | null; field_schema: FactField[]; review_interval_days: number; sort_order: number }
export type RouteOption = { id: string; name: string; region?: string | null }

// status='suggested' rows come in two kinds: a draft for a new entry, and a
// proposed revision of an existing one (target_entry_id set). They are reviewed
// differently, so the distinction is part of the type.
export type FactEntry = {
  id: string
  route_id: string
  category_slug: string
  title: string
  fields: Record<string, string | number>
  source_url: string | null
  status: 'confirmed' | 'suggested' | 'archived'
  origin: 'manual' | 'agent'
  target_entry_id: string | null
  resolution: 'applied' | 'rejected' | null
  resolved_at: string | null
  confirmed_at: string | null
  reviewed_at: string | null
  review_due_at: string | null
  updated_at: string
  route: { name: string } | null
  category: { name: string } | null
}

export type FactRevision = {
  id: string
  entry_id: string
  revision: number
  action: 'created' | 'suggested' | 'updated' | 'reviewed' | 'confirmed' | 'archived' | 'restored'
  changed_fields: string[]
  fields_before: Record<string, unknown> | null
  fields_after: Record<string, unknown> | null
  source_url: string | null
  source_entry_id: string | null
  note: string | null
  applied_at: string
  applied_by_name: string
}

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
