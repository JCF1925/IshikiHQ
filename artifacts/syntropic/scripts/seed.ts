import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // Hidden test account
  const testHash = await bcrypt.hash('Syntropic!Test2026', 12)
  const testUser = await prisma.user.upsert({
    where: { email: 'abacus-e9442339@example.com' },
    update: { passwordHash: testHash },
    create: {
      email: 'abacus-e9442339@example.com',
      name: 'Admin',
      passwordHash: testHash,
      timezone: 'Australia/Sydney',
      currency: 'AUD',
      theme: 'dark',
    },
  })

  const userId = testUser.id

  // Seed sample medications
  const med1 = await prisma.medication.upsert({
    where: { id: 'med-tirz' },
    update: {},
    create: {
      id: 'med-tirz',
      userId,
      name: 'Tirzepatide',
      genericName: 'tirzepatide',
      form: 'injection',
      strength: '5mg/0.5mL',
      unit: 'mg',
      isActive: true,
    },
  })

  const med2 = await prisma.medication.upsert({
    where: { id: 'med-meto' },
    update: {},
    create: {
      id: 'med-meto',
      userId,
      name: 'Metoprolol',
      genericName: 'metoprolol succinate',
      form: 'tablet',
      strength: '25mg',
      unit: 'mg',
      isActive: true,
    },
  })

  const med3 = await prisma.medication.upsert({
    where: { id: 'med-fexo' },
    update: {},
    create: {
      id: 'med-fexo',
      userId,
      name: 'Fexofenadine',
      genericName: 'fexofenadine hydrochloride',
      form: 'tablet',
      strength: '180mg',
      unit: 'mg',
      isActive: true,
    },
  })

  // Seed stock levels
  await prisma.stockLevel.upsert({
    where: { userId_medicationId: { userId, medicationId: med1.id } },
    update: {},
    create: { userId, medicationId: med1.id, currentQuantity: 2, reorderThreshold: 1 },
  })
  await prisma.stockLevel.upsert({
    where: { userId_medicationId: { userId, medicationId: med2.id } },
    update: {},
    create: { userId, medicationId: med2.id, currentQuantity: 45, reorderThreshold: 10 },
  })
  await prisma.stockLevel.upsert({
    where: { userId_medicationId: { userId, medicationId: med3.id } },
    update: {},
    create: { userId, medicationId: med3.id, currentQuantity: 8, reorderThreshold: 5 },
  })

  // Seed prescriptions
  const presc1 = await prisma.prescription.upsert({
    where: { id: 'presc-tirz-1' },
    update: {},
    create: {
      id: 'presc-tirz-1',
      userId,
      medicationId: med1.id,
      datePrescribed: new Date('2024-06-01'),
      quantity: 4,
      repeats: 5,
      repeatsUsed: 2,
      cost: 189.0,
    },
  })

  const presc2 = await prisma.prescription.upsert({
    where: { id: 'presc-meto-1' },
    update: {},
    create: {
      id: 'presc-meto-1',
      userId,
      medicationId: med2.id,
      datePrescribed: new Date('2024-03-15'),
      quantity: 90,
      repeats: 5,
      repeatsUsed: 3,
      pbsItemCode: '8730L',
      cost: 6.80,
    },
  })

  const presc3 = await prisma.prescription.upsert({
    where: { id: 'presc-fexo-1' },
    update: {},
    create: {
      id: 'presc-fexo-1',
      userId,
      medicationId: med3.id,
      datePrescribed: new Date('2024-04-10'),
      quantity: 30,
      repeats: 5,
      repeatsUsed: 1,
      cost: 12.50,
    },
  })

  // Seed dosage schedules
  await prisma.dosageSchedule.upsert({
    where: { id: 'ds-tirz-1' },
    update: {},
    create: {
      id: 'ds-tirz-1',
      userId,
      prescriptionId: presc1.id,
      frequency: 'weekly',
      times: ['09:00'],
      doseAmount: '5',
      presetSlot: 'morning',
      startDate: new Date('2024-06-01'),
      withFood: false,
      isActive: true,
    },
  })

  await prisma.dosageSchedule.upsert({
    where: { id: 'ds-meto-1' },
    update: {},
    create: {
      id: 'ds-meto-1',
      userId,
      prescriptionId: presc2.id,
      frequency: 'daily',
      times: ['07:00'],
      doseAmount: '1',
      presetSlot: 'morning',
      startDate: new Date('2024-03-15'),
      withFood: false,
      isActive: true,
    },
  })

  await prisma.dosageSchedule.upsert({
    where: { id: 'ds-fexo-1' },
    update: {},
    create: {
      id: 'ds-fexo-1',
      userId,
      prescriptionId: presc3.id,
      frequency: 'daily',
      times: ['08:00', '20:00'],
      doseAmount: '1',
      presetSlot: 'morning',
      startDate: new Date('2024-04-10'),
      withFood: true,
      isActive: true,
    },
  })

  // Seed financial accounts
  await prisma.finAccount.upsert({
    where: { id: 'acc-everyday' },
    update: {},
    create: {
      id: 'acc-everyday',
      userId,
      name: 'Everyday Account',
      type: 'transaction',
      institution: 'Commonwealth Bank',
      balance: 2847.50,
      bsb: '062-000',
    },
  })
  await prisma.finAccount.upsert({
    where: { id: 'acc-savings' },
    update: {},
    create: {
      id: 'acc-savings',
      userId,
      name: 'Savings Account',
      type: 'savings',
      institution: 'Commonwealth Bank',
      balance: 15230.00,
      bsb: '062-000',
    },
  })
  await prisma.finAccount.upsert({
    where: { id: 'acc-credit' },
    update: {},
    create: {
      id: 'acc-credit',
      userId,
      name: 'Credit Card',
      type: 'credit',
      institution: 'ANZ',
      balance: -1245.30,
    },
  })

  // Seed some transactions
  const txnData = [
    { id: 'txn-1', date: new Date('2026-09-07'), amount: -45.50, merchant: 'Woolworths', category: 'Groceries', accountId: 'acc-everyday' },
    { id: 'txn-2', date: new Date('2026-09-06'), amount: -12.00, merchant: 'Spotify', category: 'Subscriptions', accountId: 'acc-credit', isRecurring: true },
    { id: 'txn-3', date: new Date('2026-09-05'), amount: -189.00, merchant: 'Compounding Pharmacy', category: 'Health', accountId: 'acc-credit', isDeductible: true, taxCategory: 'Medical expenses' },
    { id: 'txn-4', date: new Date('2026-09-05'), amount: 3200.00, merchant: 'Employer', category: 'Income', accountId: 'acc-everyday', description: 'Fortnightly pay' },
    { id: 'txn-5', date: new Date('2026-09-04'), amount: -65.00, merchant: 'Uber Eats', category: 'Dining', accountId: 'acc-everyday' },
  ]
  for (const txn of txnData) {
    await prisma.transaction.upsert({
      where: { id: txn.id },
      update: {},
      create: {
        ...txn,
        userId,
        isDeductible: txn.isDeductible ?? false,
        isRecurring: txn.isRecurring ?? false,
        status: 'confirmed',
      },
    })
  }

  // Seed tasks
  const taskData = [
    { id: 'task-1', title: 'Book GP appointment', priority: 'high', dueDate: new Date('2026-09-08'), tags: ['health'] },
    { id: 'task-2', title: 'Submit tax return', priority: 'urgent', dueDate: new Date('2026-10-31'), tags: ['finance'] },
    { id: 'task-3', title: 'Refill Fexofenadine script', priority: 'medium', dueDate: new Date('2026-09-10'), tags: ['medications'], moduleRef: 'medication:med-fexo' },
    { id: 'task-4', title: 'Review monthly budget', priority: 'low', dueDate: new Date('2026-09-15'), tags: ['finance'] },
  ]
  for (const task of taskData) {
    await prisma.task.upsert({
      where: { id: task.id },
      update: {},
      create: { ...task, userId, status: 'todo' },
    })
  }

  // Seed events
  await prisma.event.upsert({
    where: { id: 'evt-1' },
    update: {},
    create: {
      id: 'evt-1',
      userId,
      title: 'Cardiologist Review',
      type: 'medical',
      startDatetime: new Date('2026-09-12T10:00:00+10:00'),
      endDatetime: new Date('2026-09-12T10:30:00+10:00'),
      location: 'Heart Clinic, 123 Collins St',
      tags: ['health', 'POTS'],
    },
  })
  await prisma.event.upsert({
    where: { id: 'evt-2' },
    update: {},
    create: {
      id: 'evt-2',
      userId,
      title: 'Team standup',
      type: 'work',
      startDatetime: new Date('2026-09-08T09:00:00+10:00'),
      endDatetime: new Date('2026-09-08T09:15:00+10:00'),
      isOnline: true,
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
    },
  })

  console.log('Seed completed successfully')
}

main()
  .catch((e) => {
    console.error('Seed error:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
