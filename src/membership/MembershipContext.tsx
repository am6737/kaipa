import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { subscribeResourceUsage } from '../lib/resourceClient';
import { getMembershipStatus, type MembershipStatus } from '../lib/membership';

interface MembershipValue {
  status: MembershipStatus | null;
  loading: boolean;
  stale: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}
const MembershipContext = createContext<MembershipValue | null>(null);

// Key by account even if its parent stays mounted during an auth transition.
export function MembershipProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  return <AccountMembershipProvider key={userId} userId={userId}>{children}</AccountMembershipProvider>;
}

function AccountMembershipProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [status, setStatus] = useState<MembershipStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const mounted = useRef(false);

  const refresh = useCallback(async () => {
    if (!mounted.current) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const current = ++generation.current;
    setLoading(true);
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const next = await getMembershipStatus(controller.signal);
      if (mounted.current && current === generation.current) {
        setStatus(next);
        setStale(false);
        setError(null);
      }
    } catch (cause) {
      if (mounted.current && current === generation.current) {
        setStale(true);
        setError(cause instanceof Error ? cause.message : 'Membership status unavailable');
      }
    } finally {
      clearTimeout(timeout);
      if (mounted.current && current === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = setInterval(() => {if (AppState.currentState === 'active') void refresh();},60_000);
    const unsubscribe = subscribeResourceUsage(() => { void refresh(); });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      mounted.current = false;
      generation.current++;
      requestRef.current?.abort();
      subscription.remove();
      unsubscribe();
      clearInterval(timer);
    };
  }, [refresh, userId]);

  return <MembershipContext.Provider value={{ status, loading, stale, error, refresh }}>{children}</MembershipContext.Provider>;
}

export function useMembership(): MembershipValue {
  const value = useContext(MembershipContext);
  if (!value) throw new Error('useMembership requires MembershipProvider');
  return value;
}

export function useResourceUsage(resource: string) {
  const { status, loading, stale, error, refresh } = useMembership();
  return { usage: status?.resources.find((item) => item.resource === resource) ?? null, loading, stale, error, refresh };
}
