import useSWR from 'swr';
import { useCallback } from 'react';
import { toast } from 'sonner';

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error('Failed to fetch storage');
  return res.json();
});

async function requireSuccess(res: Response) {
  if (res.ok) return res
  const body = await res.json().catch(() => null)
  throw new Error(body?.error || 'Household action failed')
}

export type StorageLocation = {
  id: string;
  name: string;
  description?: string;
};

export type StorageContainer = {
  id: string;
  name: string;
  locationId: string;
  positionText?: string;
};

export type StorageItem = {
  id: string;
  name: string;
  containerId?: string;
  locationId?: string;
  labels: { id: string; value: string; createdById?: string }[];
  description?: string;
  quantity: number | string;
  unit?: string;
  positionText?: string;
};

export type StorageData = {
  locations: StorageLocation[];
  containers: StorageContainer[];
  items: StorageItem[];
};

export type StorageLabelSelection = {
  type: 'item' | 'container';
  id: string;
  displayText: string;
};

export type GeneratedStorageLabel = StorageLabelSelection & {
  referenceId: string;
  resourceId: string;
  token: string;
  path: string;
  url: string;
};

export type ActiveStorageLabel = {
  referenceId: string;
  type: 'item' | 'container';
  resourceId: string;
  resourceName: string;
  createdAt: string;
};

type ActiveStorageLabelsResponse = {
  labels: ActiveStorageLabel[];
};

export function useStorage(householdId?: string, query: string = '') {
  const url = householdId 
    ? `/api/households/${householdId}/storage${query ? `?q=${encodeURIComponent(query)}` : ''}` 
    : null;
    
  const { data, error, isLoading, mutate } = useSWR<StorageData>(url, fetcher);
  const labelsUrl = householdId ? `/api/households/${householdId}/storage/labels` : null;
  const {
    data: labelsData,
    error: labelsError,
    isLoading: isLoadingLabels,
    mutate: mutateLabels,
  } = useSWR<ActiveStorageLabelsResponse>(labelsUrl, fetcher);

  const addResource = useCallback(async (resourceType: string, payload: any) => {
    if (!householdId) return;
    const res = await fetch(`/api/households/${householdId}/storage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resourceType, ...payload }),
    });
    try {
      await requireSuccess(res)
      mutate();
      toast.success('Storage updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Storage action failed')
    }
  }, [householdId, mutate]);

  const updateResource = useCallback(async (resourceType: string, id: string, payload: any) => {
    if (!householdId) return;
    const res = await fetch(`/api/households/${householdId}/storage/${resourceType}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    try {
      await requireSuccess(res)
      mutate();
      toast.success('Storage updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Storage action failed')
    }
  }, [householdId, mutate]);

  const deleteResource = useCallback(async (resourceType: string, id: string) => {
    if (!householdId) return;
    const res = await fetch(`/api/households/${householdId}/storage/${resourceType}/${id}`, {
      method: 'DELETE',
    });
    try {
      await requireSuccess(res)
      mutate();
      toast.success('Storage record removed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Storage action failed')
    }
  }, [householdId, mutate]);

  const generateQR = useCallback(async (itemId: string) => {
    if (!householdId) return null;
    const res = await fetch(`/api/households/${householdId}/storage/items/${itemId}/qr`, {
      method: 'POST',
    });
    await requireSuccess(res)
    const result = await res.json()
    return {
      ...result,
      url: new URL(result.path, window.location.origin).toString(),
    };
  }, [householdId]);

  const generateLabels = useCallback(async (selections: StorageLabelSelection[]) => {
    if (!householdId) return [];
    const res = await fetch(`/api/households/${householdId}/storage/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selections }),
    });
    await requireSuccess(res);
    const result = await res.json();
    return result.labels.map((label: Omit<GeneratedStorageLabel, 'url'>) => ({
      ...label,
      url: new URL(label.path, window.location.origin).toString(),
    })) as GeneratedStorageLabel[];
  }, [householdId]);

  const reprintLabel = useCallback(async (referenceId: string) => {
    if (!householdId) throw new Error('No household selected')
    const res = await fetch(`/api/households/${householdId}/storage/labels/${referenceId}`, {
      method: 'POST',
    });
    await requireSuccess(res);
    const result = await res.json();
    await mutateLabels();
    const label = result.label as Omit<GeneratedStorageLabel, 'url'>;
    return {
      ...label,
      url: new URL(label.path, window.location.origin).toString(),
    } as GeneratedStorageLabel;
  }, [householdId, mutateLabels]);

  const revokeLabel = useCallback(async (referenceId: string) => {
    if (!householdId) return false
    const res = await fetch(`/api/households/${householdId}/storage/labels/${referenceId}`, {
      method: 'DELETE',
    });
    try {
      await requireSuccess(res)
      await mutateLabels()
      toast.success('Storage label revoked')
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Storage label action failed')
      return false
    }
  }, [householdId, mutateLabels]);

  return {
    data,
    isLoading,
    isError: error,
    addResource,
    updateResource,
    deleteResource,
    generateQR,
    generateLabels,
    activeLabels: labelsData?.labels || [],
    isLoadingLabels,
    labelsError,
    reprintLabel,
    revokeLabel,
  };
}
