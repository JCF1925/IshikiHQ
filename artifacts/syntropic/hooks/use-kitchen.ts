import useSWR from 'swr';
import { useCallback } from 'react';
import { toast } from 'sonner';

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error('Failed to fetch kitchen');
  return res.json();
});

async function requireSuccess(res: Response) {
  if (res.ok) return res
  const body = await res.json().catch(() => null)
  throw new Error(body?.error || 'Household action failed')
}

export type Recipe = {
  id: string;
  name: string;
  ingredients: { id: string; name: string }[];
  instructions: string;
  prepMinutes: number;
  sourceUrl?: string | null;
  importMethod?: 'url' | 'image' | null;
};

export type InventoryItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  expiresAt?: string;
  location: string;
};

export type MealPlan = {
  id: string;
  title: string;
  plannedFor: string;
  mealType: string;
  recipeId?: string;
  notes?: string;
};

export type ShoppingItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  checked: boolean;
};

export type KitchenData = {
  recipes: Recipe[];
  inventory: InventoryItem[];
  mealPlans: MealPlan[];
  shoppingList: ShoppingItem[];
};

export function useKitchen(householdId?: string) {
  const { data, error, isLoading, mutate } = useSWR<KitchenData>(
    householdId ? `/api/households/${householdId}/kitchen` : null,
    fetcher
  );

  const addResource = useCallback(async (resourceType: string, payload: any) => {
    if (!householdId) return;
    const res = await fetch(`/api/households/${householdId}/kitchen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resourceType, ...payload }),
    });
    try {
      await requireSuccess(res)
      mutate();
      toast.success('Kitchen updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Kitchen action failed')
    }
  }, [householdId, mutate]);

  const updateResource = useCallback(async (resourceType: string, id: string, payload: any) => {
    if (!householdId) return;
    const res = await fetch(`/api/households/${householdId}/kitchen/${resourceType}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    try {
      await requireSuccess(res)
      mutate();
      toast.success('Kitchen updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Kitchen action failed')
    }
  }, [householdId, mutate]);

  const deleteResource = useCallback(async (resourceType: string, id: string) => {
    if (!householdId) return;
    const res = await fetch(`/api/households/${householdId}/kitchen/${resourceType}/${id}`, {
      method: 'DELETE',
    });
    try {
      await requireSuccess(res)
      mutate();
      toast.success('Kitchen item removed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Kitchen action failed')
    }
  }, [householdId, mutate]);

  return {
    data,
    isLoading,
    isError: error,
    addResource,
    updateResource,
    deleteResource,
  };
}
