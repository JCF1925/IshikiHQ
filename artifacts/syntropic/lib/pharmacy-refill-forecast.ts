import { prisma } from '@/lib/db'
import { forecastRefill } from '@/lib/pharmacy-refill'

export async function getRefillForecasts(userId: string, now = new Date()) {
  const medications = await prisma.medication.findMany({
    where: { userId, isActive: true },
    include: {
      stockLevels: true,
      dosageSchedules: { where: { isActive: true } },
      prescriptions: true,
      pharmacyPreferences: { include: { pharmacy: true } },
    },
  })

  return Promise.all(medications.map(async medication => {
    const scheduleIds = medication.dosageSchedules.map(schedule => schedule.id)
    const logs = scheduleIds.length
      ? await prisma.medicationLog.findMany({
          where: { userId, scheduleId: { in: scheduleIds }, skipped: false, takenAt: { lt: now, gte: new Date(now.getTime() - 14 * 86400000) } },
          select: { takenAt: true, doseTaken: true, skipped: true, scheduleId: true },
        })
      : []
    const forecast = forecastRefill({
      now,
      stock: medication.stockLevels[0]?.currentQuantity ?? 0,
      reorderThreshold: medication.stockLevels[0]?.reorderThreshold ?? 0,
      requiresPrescription: !medication.isOtc,
      schedules: medication.dosageSchedules.map(schedule => ({
        id: schedule.id,
        frequency: schedule.frequency,
        times: schedule.times,
        doseAmount: schedule.doseAmount,
        startDate: schedule.startDate,
        endDate: schedule.endDate,
      })),
      logs: logs.flatMap(log => log.scheduleId
        ? [{ ...log, takenAt: log.takenAt, scheduleId: log.scheduleId }]
        : []),
      prescriptions: medication.prescriptions.map(prescription => ({
        quantity: prescription.quantity,
        repeats: prescription.repeats,
        repeatsUsed: prescription.repeatsUsed,
        expiryDate: prescription.expiryDate,
      })),
    })
    return {
      medicationId: medication.id,
      medication: medication.name,
      stock: medication.stockLevels[0]?.currentQuantity ?? 0,
      reorderThreshold: medication.stockLevels[0]?.reorderThreshold ?? 0,
      scheduledConsumption: forecast.scheduled14,
      recordedPrnConsumption: forecast.prnRecorded,
      expectedConsumption: forecast.scheduled14 + forecast.prnRecorded,
      projectedStock: forecast.projected,
      availablePrescriptionFills: forecast.availableFills,
      availablePrescriptionSupply: forecast.availableSupply,
      prescriptionId: medication.prescriptions.find(prescription =>
        (!prescription.expiryDate || prescription.expiryDate >= now) &&
        prescription.repeatsUsed < prescription.repeats + 1,
      )?.id ?? null,
      scriptSupplyWarning: forecast.scriptSupplyWarning,
      refillDate: forecast.refillDate,
      needsRefill: forecast.due,
      uncertainty: forecast.uncertain
        ? 'Recent recorded PRN use is included as a planning estimate; future PRN use is unknown and no unrecorded use is inferred.'
        : 'No unrecorded PRN use is inferred.',
      pharmacyId: medication.pharmacyPreferences[0]?.pharmacyId ?? null,
      pharmacy: medication.pharmacyPreferences[0]?.pharmacy?.name ?? null,
    }
  }))
}