-- CreateEnum
CREATE TYPE "HouseholdRole" AS ENUM ('owner', 'member', 'contributor', 'viewer');

-- CreateEnum
CREATE TYPE "HouseholdAllocationMethod" AS ENUM ('equal', 'percentage', 'fixed', 'shares');

-- CreateEnum
CREATE TYPE "HouseholdAuditAction" AS ENUM ('household_created', 'household_updated', 'household_deleted', 'invitation_created', 'invitation_revoked', 'invitation_accepted', 'member_role_changed', 'member_removed', 'expense_created', 'expense_updated', 'expense_deleted', 'settlement_created', 'chore_created', 'chore_completed', 'pet_created', 'pet_updated', 'pet_deleted', 'pet_care_created', 'pet_care_updated', 'pet_care_deleted');

-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdMembership" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "HouseholdRole" NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "HouseholdMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdInvitation" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "HouseholdRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdExpense" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "incurredAt" TIMESTAMP(3) NOT NULL,
    "recurringRule" TEXT,
    "isRecurringTemplate" BOOLEAN NOT NULL DEFAULT false,
    "recurringSourceId" TEXT,
    "occurrenceKey" TEXT,
    "allocationMethod" "HouseholdAllocationMethod" NOT NULL,
    "linkedTransactionId" TEXT,
    "paidByMembershipId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdExpenseAllocation" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "value" DECIMAL(14,4) NOT NULL,
    "allocatedAmount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "HouseholdExpenseAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdSettlement" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "payerMembershipId" TEXT NOT NULL,
    "payeeMembershipId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "settledAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdChore" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "recurrenceRule" TEXT,
    "rotationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "rotationCursorMembershipId" TEXT,
    "nextDueAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdChore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdChoreAssignment" (
    "id" TEXT NOT NULL,
    "choreId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "rotationOrder" INTEGER NOT NULL DEFAULT 0,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdChoreAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdChoreCompletion" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "choreId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "completedById" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurrenceKey" TEXT,
    "note" TEXT,

    CONSTRAINT "HouseholdChoreCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdPet" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "breed" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdPet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdPetCareSchedule" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "recurrenceRule" TEXT NOT NULL,
    "nextDueAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdPetCareSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdPetAppointment" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "provider" TEXT,
    "location" TEXT,
    "cost" DECIMAL(14,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdPetAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdPetMedication" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "instructions" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "reorderThreshold" DECIMAL(14,3),
    "unit" TEXT,
    "unitCost" DECIMAL(14,2),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdPetMedication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdPetCost" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "incurredAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdPetCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdAuditRecord" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" "HouseholdAuditAction" NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "subjectUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdAuditRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Household_createdById_idx" ON "Household"("createdById");

-- CreateIndex
CREATE INDEX "HouseholdMembership_userId_removedAt_idx" ON "HouseholdMembership"("userId", "removedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdMembership_householdId_userId_key" ON "HouseholdMembership"("householdId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdInvitation_tokenHash_key" ON "HouseholdInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "HouseholdInvitation_householdId_email_idx" ON "HouseholdInvitation"("householdId", "email");

-- CreateIndex
CREATE INDEX "HouseholdInvitation_tokenHash_idx" ON "HouseholdInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "HouseholdExpense_householdId_incurredAt_idx" ON "HouseholdExpense"("householdId", "incurredAt");

-- CreateIndex
CREATE INDEX "HouseholdExpense_createdById_idx" ON "HouseholdExpense"("createdById");

-- CreateIndex
CREATE INDEX "HouseholdExpense_linkedTransactionId_idx" ON "HouseholdExpense"("linkedTransactionId");

-- CreateIndex
CREATE INDEX "HouseholdExpense_paidByMembershipId_idx" ON "HouseholdExpense"("paidByMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdExpense_recurringSourceId_occurrenceKey_key" ON "HouseholdExpense"("recurringSourceId", "occurrenceKey");

-- CreateIndex
CREATE INDEX "HouseholdExpenseAllocation_membershipId_idx" ON "HouseholdExpenseAllocation"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdExpenseAllocation_expenseId_membershipId_key" ON "HouseholdExpenseAllocation"("expenseId", "membershipId");

-- CreateIndex
CREATE INDEX "HouseholdSettlement_householdId_settledAt_idx" ON "HouseholdSettlement"("householdId", "settledAt");

-- CreateIndex
CREATE INDEX "HouseholdChore_householdId_archivedAt_idx" ON "HouseholdChore"("householdId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdChoreAssignment_choreId_membershipId_key" ON "HouseholdChoreAssignment"("choreId", "membershipId");

-- CreateIndex
CREATE INDEX "HouseholdChoreCompletion_householdId_completedAt_idx" ON "HouseholdChoreCompletion"("householdId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdChoreCompletion_choreId_occurrenceKey_key" ON "HouseholdChoreCompletion"("choreId", "occurrenceKey");

-- CreateIndex
CREATE INDEX "HouseholdPet_householdId_idx" ON "HouseholdPet"("householdId");

-- CreateIndex
CREATE INDEX "HouseholdPetCost_petId_incurredAt_idx" ON "HouseholdPetCost"("petId", "incurredAt");

-- CreateIndex
CREATE INDEX "HouseholdAuditRecord_householdId_createdAt_idx" ON "HouseholdAuditRecord"("householdId", "createdAt");

-- CreateIndex
CREATE INDEX "HouseholdAuditRecord_resourceType_resourceId_idx" ON "HouseholdAuditRecord"("resourceType", "resourceId");

-- AddForeignKey
ALTER TABLE "Household" ADD CONSTRAINT "Household_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMembership" ADD CONSTRAINT "HouseholdMembership_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMembership" ADD CONSTRAINT "HouseholdMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdInvitation" ADD CONSTRAINT "HouseholdInvitation_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdExpense" ADD CONSTRAINT "HouseholdExpense_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdExpense" ADD CONSTRAINT "HouseholdExpense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdExpense" ADD CONSTRAINT "HouseholdExpense_linkedTransactionId_fkey" FOREIGN KEY ("linkedTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdExpense" ADD CONSTRAINT "HouseholdExpense_paidByMembershipId_fkey" FOREIGN KEY ("paidByMembershipId") REFERENCES "HouseholdMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdExpense" ADD CONSTRAINT "HouseholdExpense_recurringSourceId_fkey" FOREIGN KEY ("recurringSourceId") REFERENCES "HouseholdExpense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdExpenseAllocation" ADD CONSTRAINT "HouseholdExpenseAllocation_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "HouseholdExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdExpenseAllocation" ADD CONSTRAINT "HouseholdExpenseAllocation_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "HouseholdMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdSettlement" ADD CONSTRAINT "HouseholdSettlement_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdSettlement" ADD CONSTRAINT "HouseholdSettlement_payerMembershipId_fkey" FOREIGN KEY ("payerMembershipId") REFERENCES "HouseholdMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdSettlement" ADD CONSTRAINT "HouseholdSettlement_payeeMembershipId_fkey" FOREIGN KEY ("payeeMembershipId") REFERENCES "HouseholdMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdChore" ADD CONSTRAINT "HouseholdChore_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdChore" ADD CONSTRAINT "HouseholdChore_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdChoreAssignment" ADD CONSTRAINT "HouseholdChoreAssignment_choreId_fkey" FOREIGN KEY ("choreId") REFERENCES "HouseholdChore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdChoreAssignment" ADD CONSTRAINT "HouseholdChoreAssignment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "HouseholdMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdChoreCompletion" ADD CONSTRAINT "HouseholdChoreCompletion_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdChoreCompletion" ADD CONSTRAINT "HouseholdChoreCompletion_choreId_fkey" FOREIGN KEY ("choreId") REFERENCES "HouseholdChore"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdChoreCompletion" ADD CONSTRAINT "HouseholdChoreCompletion_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "HouseholdMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdPet" ADD CONSTRAINT "HouseholdPet_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdPet" ADD CONSTRAINT "HouseholdPet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdPetCareSchedule" ADD CONSTRAINT "HouseholdPetCareSchedule_petId_fkey" FOREIGN KEY ("petId") REFERENCES "HouseholdPet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdPetCareSchedule" ADD CONSTRAINT "HouseholdPetCareSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdPetAppointment" ADD CONSTRAINT "HouseholdPetAppointment_petId_fkey" FOREIGN KEY ("petId") REFERENCES "HouseholdPet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdPetAppointment" ADD CONSTRAINT "HouseholdPetAppointment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdPetMedication" ADD CONSTRAINT "HouseholdPetMedication_petId_fkey" FOREIGN KEY ("petId") REFERENCES "HouseholdPet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdPetMedication" ADD CONSTRAINT "HouseholdPetMedication_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdPetCost" ADD CONSTRAINT "HouseholdPetCost_petId_fkey" FOREIGN KEY ("petId") REFERENCES "HouseholdPet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdPetCost" ADD CONSTRAINT "HouseholdPetCost_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdAuditRecord" ADD CONSTRAINT "HouseholdAuditRecord_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "enforce_household_currency"() RETURNS trigger AS $$ BEGIN IF NEW."currency" <> (SELECT "currency" FROM "Household" WHERE "id" = NEW."householdId") THEN RAISE EXCEPTION 'shared records must use their household currency'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "HouseholdExpense_currency_trigger" BEFORE INSERT OR UPDATE OF "currency", "householdId" ON "HouseholdExpense" FOR EACH ROW EXECUTE FUNCTION "enforce_household_currency"();
CREATE TRIGGER "HouseholdSettlement_currency_trigger" BEFORE INSERT OR UPDATE OF "currency", "householdId" ON "HouseholdSettlement" FOR EACH ROW EXECUTE FUNCTION "enforce_household_currency"();
