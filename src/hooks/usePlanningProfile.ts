import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface UserPlanningProfile {
  heightCm: number | null;
  weightKg: number | null;
  ageYears: number | null;
  dietaryRestrictions: string;
}

const EMPTY_PLANNING_PROFILE: UserPlanningProfile = {
  heightCm: null,
  weightKg: null,
  ageYears: null,
  dietaryRestrictions: '',
};

export const emptyPlanningProfile = (): UserPlanningProfile => ({ ...EMPTY_PLANNING_PROFILE });

function optionalNumber(value: unknown) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function usePlanningProfile(userId: string | undefined) {
  const [planningProfile, setPlanningProfile] = useState<UserPlanningProfile>(EMPTY_PLANNING_PROFILE);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  const fetch = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    setPlanningProfile(emptyPlanningProfile());
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('user_planning_profiles')
      .select('height_cm,weight_kg,age_years,dietary_restrictions')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      if (currentRequestId === requestId.current) setLoading(false);
      throw error;
    }
    if (currentRequestId !== requestId.current) return;
    setPlanningProfile({
      heightCm: optionalNumber(data?.height_cm),
      weightKg: optionalNumber(data?.weight_kg),
      ageYears: optionalNumber(data?.age_years),
      dietaryRestrictions: data?.dietary_restrictions?.trim() || '',
    });
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void fetch().catch(() => undefined);
  }, [fetch]);

  const savePlanningProfile = useCallback(async (next: UserPlanningProfile) => {
    if (!userId) return;
    const normalized: UserPlanningProfile = {
      heightCm: next.heightCm,
      weightKg: next.weightKg,
      ageYears: next.ageYears,
      dietaryRestrictions: next.dietaryRestrictions.trim().slice(0, 200),
    };
    const empty = normalized.heightCm == null
      && normalized.weightKg == null
      && normalized.ageYears == null
      && !normalized.dietaryRestrictions;

    const result = empty
      ? await supabase.from('user_planning_profiles').delete().eq('user_id', userId)
      : await supabase.from('user_planning_profiles').upsert({
        user_id: userId,
        height_cm: normalized.heightCm,
        weight_kg: normalized.weightKg,
        age_years: normalized.ageYears,
        dietary_restrictions: normalized.dietaryRestrictions || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    if (result.error) throw result.error;
    setPlanningProfile(normalized);
  }, [userId]);

  return { planningProfile, loading, savePlanningProfile, refetch: fetch };
}
