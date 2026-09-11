import { getFeatureInventory } from '@/lib/feature-inventory'
import { FeatureInventory } from './feature-inventory'

export default function FeatureInventoryPage() {
  return <FeatureInventory rows={getFeatureInventory()} />
}