export type PriceUnit = 'count' | 'g' | 'kg' | 'mL' | 'L'
export function buildPriceWatchDto(form: { productName: string; packQuantity: string; packUnit: string; preferredRetailers: string; targetPrice: string; checkCadence: string; status?: string }) {
  return { productName: form.productName.trim(), packQuantity: form.packQuantity, packUnit: form.packUnit, preferredRetailers: form.preferredRetailers.split(',').map((s) => s.trim()).filter(Boolean), targetPrice: form.targetPrice || '', checkCadence: form.checkCadence || '', ...(form.status ? { status: form.status } : {}) }
}
export function buildObservationDto(form: { price: string; packQuantity: string; packUnit: string; shippingCost: string; observedAt: string; sourceUrl: string; membershipAssumption: string; notes: string }) {
  const date = new Date(form.observedAt)
  if (Number.isNaN(date.getTime())) throw new Error('Enter a valid observation date and time.')
  return { price: form.price, packQuantity: form.packQuantity, packUnit: form.packUnit, shippingCost: form.shippingCost, observedAt: date.toISOString(), sourceUrl: form.sourceUrl || '', membershipAssumption: form.membershipAssumption || '', notes: form.notes || '' }
}

const factors: Record<PriceUnit, { base: 'count' | 'mass' | 'volume'; factor: number }> = {
  count: { base: 'count', factor: 1 }, g: { base: 'mass', factor: 1 }, kg: { base: 'mass', factor: 1000 },
  mL: { base: 'volume', factor: 1 }, L: { base: 'volume', factor: 1000 },
}
export function normalizeUnitPrice(price: number, quantity: number, unit: string, shipping = 0) {
  const info = factors[unit as PriceUnit]
  if (!info) return { comparable: false, explanation: `Unit "${unit}" is not supported for comparison.` }
  if (!Number.isFinite(price) || !Number.isFinite(quantity) || quantity <= 0) return { comparable: false, explanation: 'Price and pack quantity must be positive numbers.' }
  const total = price + (Number.isFinite(shipping) ? shipping : 0)
  const value = total / (quantity * info.factor)
  const displayUnit = info.base === 'count' ? 'item' : info.base === 'mass' ? '100g' : '100mL'
  const per = info.base === 'count' ? value : value * 100
  return { comparable: true, dimension: info.base, value: per, unit: displayUnit, calculation: `$${total.toFixed(2)} ÷ ${quantity} ${unit} = $${per.toFixed(2)} per ${displayUnit}` }
}

/** Compare offers only when their physical dimensions match. */
export function compareUnitPrices(a: ReturnType<typeof normalizeUnitPrice>, b: ReturnType<typeof normalizeUnitPrice>) {
  if (!a.comparable || !b.comparable) return { comparable: false, explanation: 'One or both offers cannot be normalised.' }
  if (a.dimension !== b.dimension) return { comparable: false, explanation: `Offers are not comparable: ${a.dimension} and ${b.dimension} measure different dimensions (count, mass, or volume).` }
  return { comparable: true, explanation: `Both offers are compared per ${a.unit}.` }
}

export function evaluatePriceTarget(
  targetPrice: number | null | undefined,
  watchQuantity: number,
  watchUnit: string,
  observationPrice: number,
  observationQuantity: number,
  observationUnit: string,
  shipping = 0,
) {
  if (targetPrice == null) return { status: 'uncomparable' as const, explanation: 'No target price has been set.' }
  const target = normalizeUnitPrice(targetPrice, watchQuantity, watchUnit)
  const observed = normalizeUnitPrice(observationPrice, observationQuantity, observationUnit, shipping)
  const comparison = compareUnitPrices(target, observed)
  if (!comparison.comparable) return { status: 'uncomparable' as const, explanation: comparison.explanation }
  if (target.value == null || observed.value == null) {
    return { status: 'uncomparable' as const, explanation: 'One or both offers cannot be normalised.' }
  }
  const met = observed.value <= target.value
  return {
    status: met ? 'met' as const : 'above' as const,
    explanation: met
      ? `${observed.calculation}; target is ${target.calculation}.`
      : `${observed.calculation}; above target of ${target.calculation}.`,
  }
}