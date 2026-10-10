// Runtime guide guidance; external collection now happens offline.
export const trustedGuideSkill = {
  description: 'Read and cite the team maintained trusted route guides.',
  body: `Use read_route_guide with a catalog route ID or route name. The guide content is trusted and may be used directly. Cite its source titles, platforms, observedOn dates and links when present; sources without links still count as citations. State the guide asOf date for prices, transport and closures. If the guide is missing or lacks the requested coverage, say plainly that this route guide does not yet cover it, without estimating or inventing. External guide collection is offline only. Live rail, weather and maps remain available for operational questions. Do not submit route fact suggestions.`,
} as const;
