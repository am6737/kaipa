import type { AgentAttachment } from './types.ts';

// History is newest first. Preserve original upload messages as the source of truth.
export function conversationAttachments(
  current: AgentAttachment[],
  flow: AgentAttachment[],
  history: AgentAttachment[][],
): AgentAttachment[] {
  const seen = new Set<string>();
  return [...current, ...history.flat(), ...flow].filter((attachment) => {
    if (seen.has(attachment.url)) return false;
    seen.add(attachment.url);
    return true;
  });
}
