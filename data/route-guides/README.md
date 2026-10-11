# Legacy route guide import sources

The Markdown files in this directory are legacy collection and import sources only. They are never read by the Expo app or the `app-agent` Edge Function at runtime.

The source of truth is the published knowledge base in the admin console under **路线知识库**. Curators import or edit drafts there, review citations and `asOf`, then publish. Published entries are available to planning immediately without a redeploy.

The files keep the historical contract: YAML frontmatter, the nine Chinese section headings, per-section source citations, and an `asOf` date. Use `node scripts/import-route-guides.mjs --dry-run` to inspect the rows that would be imported.
