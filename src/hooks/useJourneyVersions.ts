import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type JourneyVersionKind = 'create' | 'update' | 'restore';

export interface JourneyVersion {
  id: string;
  journeyId: string;
  versionNumber: number;
  snapshot: Record<string, unknown>;
  changedFields: string[];
  changeKind: JourneyVersionKind;
  changedBy?: string;
  changedByName: string;
  changedAt: string;
}

function mapVersion(row: any): JourneyVersion {
  return {
    id: row.id,
    journeyId: row.journey_id,
    versionNumber: row.version_number,
    snapshot: row.snapshot || {},
    changedFields: row.changed_fields || [],
    changeKind: row.change_kind,
    changedBy: row.changed_by || undefined,
    changedByName: row.changed_by_name || '',
    changedAt: row.changed_at,
  };
}

export function useJourneyVersions(journeyId: string | undefined) {
  const [versions, setVersions] = useState<JourneyVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const refetch = useCallback(async () => {
    if (!journeyId) {
      setVersions([]);
      setLoading(false);
      return [];
    }

    setLoading(true);
    setError(undefined);
    const { data, error: queryError } = await supabase
      .from('journey_versions')
      .select('id, journey_id, version_number, snapshot, changed_fields, change_kind, changed_by, changed_by_name, changed_at')
      .eq('journey_id', journeyId)
      .order('version_number', { ascending: false });

    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return [];
    }

    const next = (data || []).map(mapVersion);
    setVersions(next);
    setLoading(false);
    return next;
  }, [journeyId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { versions, loading, error, refetch };
}

export async function restoreJourneyVersion(versionId: string) {
  const { error } = await supabase.rpc('restore_journey_version', {
    target_version_id: versionId,
  });
  if (error) throw error;
}

export function useJourneyVersionSummary(journeyId: string | undefined) {
  const [latest, setLatest] = useState<Pick<JourneyVersion, 'versionNumber' | 'changedAt'> | null>(null);

  useEffect(() => {
    let active = true;
    if (!journeyId) {
      setLatest(null);
      return () => { active = false; };
    }

    void supabase
      .from('journey_versions')
      .select('version_number, changed_at')
      .eq('journey_id', journeyId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setLatest(data ? { versionNumber: data.version_number, changedAt: data.changed_at } : null);
      });

    return () => { active = false; };
  }, [journeyId]);

  return latest;
}
