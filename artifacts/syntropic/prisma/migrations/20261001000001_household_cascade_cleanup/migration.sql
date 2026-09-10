-- Hard household deletion must be deterministic. Soft member removal still
-- preserves history; these cascades apply only when the aggregate is deleted.
ALTER TABLE "HouseholdExpense" DROP CONSTRAINT "HouseholdExpense_paidByMembershipId_fkey";
ALTER TABLE "HouseholdExpense" ADD CONSTRAINT "HouseholdExpense_paidByMembershipId_fkey" FOREIGN KEY ("paidByMembershipId") REFERENCES "HouseholdMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HouseholdExpenseAllocation" DROP CONSTRAINT "HouseholdExpenseAllocation_membershipId_fkey";
ALTER TABLE "HouseholdExpenseAllocation" ADD CONSTRAINT "HouseholdExpenseAllocation_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "HouseholdMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HouseholdSettlement" DROP CONSTRAINT "HouseholdSettlement_payerMembershipId_fkey";
ALTER TABLE "HouseholdSettlement" ADD CONSTRAINT "HouseholdSettlement_payerMembershipId_fkey" FOREIGN KEY ("payerMembershipId") REFERENCES "HouseholdMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HouseholdSettlement" DROP CONSTRAINT "HouseholdSettlement_payeeMembershipId_fkey";
ALTER TABLE "HouseholdSettlement" ADD CONSTRAINT "HouseholdSettlement_payeeMembershipId_fkey" FOREIGN KEY ("payeeMembershipId") REFERENCES "HouseholdMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HouseholdChoreAssignment" DROP CONSTRAINT "HouseholdChoreAssignment_membershipId_fkey";
ALTER TABLE "HouseholdChoreAssignment" ADD CONSTRAINT "HouseholdChoreAssignment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "HouseholdMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HouseholdChoreCompletion" DROP CONSTRAINT "HouseholdChoreCompletion_choreId_fkey";
ALTER TABLE "HouseholdChoreCompletion" ADD CONSTRAINT "HouseholdChoreCompletion_choreId_fkey" FOREIGN KEY ("choreId") REFERENCES "HouseholdChore"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HouseholdChoreCompletion" DROP CONSTRAINT "HouseholdChoreCompletion_membershipId_fkey";
ALTER TABLE "HouseholdChoreCompletion" ADD CONSTRAINT "HouseholdChoreCompletion_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "HouseholdMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "protect_household_audit"() RETURNS trigger AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'household audit records are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "HouseholdAuditRecord_immutable" BEFORE UPDATE OR DELETE ON "HouseholdAuditRecord"
FOR EACH ROW EXECUTE FUNCTION "protect_household_audit"();