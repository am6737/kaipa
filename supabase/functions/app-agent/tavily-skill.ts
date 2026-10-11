// Runtime guide guidance; external collection now happens offline.
export const trustedGuideSkill = {
  description: 'Read and cite the team maintained trusted route guides.',
  body: `Use read_route_guide with a catalog route ID or route name, or search_route_knowledge for a keyword or area. Published knowledge is trusted and may be used directly. Cite source titles, platforms, observedOn dates and links when present; sources without links still count as citations. State asOf dates for prices, transport and closures. If nothing is found, say so plainly without estimating or inventing. External guide collection is offline only. Live rail, weather and maps remain available for operational questions. Do not submit route fact suggestions.`,
} as const;
