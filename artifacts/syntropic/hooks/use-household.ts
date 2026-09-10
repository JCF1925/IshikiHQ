import useSWR from 'swr';

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (res.status === 401 && typeof window !== 'undefined') {
    const returnTo = `${window.location.pathname}${window.location.search}`
    window.location.assign(`/login?callbackUrl=${encodeURIComponent(returnTo)}`)
    throw new Error('Authentication required')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error || 'Failed to fetch households')
  }
  return res.json()
}

export type Household = {
  id: string;
  name: string;
  kind: 'household';
  membershipId: string;
  role: 'owner' | 'member' | 'contributor' | 'viewer';
};

export function useHousehold() {
  const { data, error, isLoading } = useSWR<{
    contexts: Array<Household | { kind: 'private'; id: 'private'; name: string }>
  }>('/api/households', fetcher);

  const households = data?.contexts.filter((context): context is Household => context.kind === 'household')
  const activeHousehold = households?.[0];

  return {
    households,
    activeHousehold,
    isLoading,
    isError: error,
  };
}
