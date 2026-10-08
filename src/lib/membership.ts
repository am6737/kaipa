import { supabase } from './supabase';

export type MembershipPlan = 'free' | 'member';
export type OperationStage = 'open_access' | 'trial_operation' | 'paid';
export interface ResourceUsage {
  resource: string;
  period: 'lifetime' | 'month';
  limit: number;
  enforcedLimit: number;
  used: number;
  reserved: number;
  tracking: 'live' | 'not_connected';
  periodKey: string;
  resetAt: string | null;
  policyVersions: string[];
}
export interface MembershipStatus {
  membershipPlan: MembershipPlan;
  isLifetime: boolean;
  validUntil: string | null;
  accessSource: 'membership' | 'campaign' | 'free';
  campaign: { id: string; endsAt: string | null } | null;
  stage: OperationStage;
  purchaseEnabled: boolean;
  features: Record<string, boolean>;
  resources: ResourceUsage[];
  serverTime: string;
  meteringStartedAt: string;
  products: {id: 'monthly' | 'yearly' | 'lifetime';term_months:number|null;is_lifetime:boolean}[];
  transitionEndsAt: string | null;
}

// No local "free" fallback: a missing migration is unavailable, not proof
// that the account has no purchased rights. This is display data, not authority.
export async function getMembershipStatus(signal?: AbortSignal): Promise<MembershipStatus> {
  let request = supabase.rpc('get_membership_status');
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  if (!data || !['free', 'member'].includes(data.membershipPlan)
    || !Array.isArray(data.resources) || typeof data.features !== 'object') {
    throw new Error('Invalid membership status');
  }
  return data as MembershipStatus;
}
