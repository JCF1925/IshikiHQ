-- Membership deletion must never erase shared history. Deferred NO ACTION lets
-- a complete Household cascade remove the entire aggregate by transaction end,
-- while direct membership/user cascades remain blocked when history exists.
ALTER TABLE "HouseholdExpense" DROP CONSTRAINT "HouseholdExpense_paidByMembershipId_fkey";
ALTER TABLE "HouseholdExpense" ADD CONSTRAINT "HouseholdExpense_paidByMembershipId_fkey" FOREIGN KEY ("paidByMembershipId") REFERENCES "HouseholdMembership"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "HouseholdExpenseAllocation" DROP CONSTRAINT "HouseholdExpenseAllocation_membershipId_fkey";
ALTER TABLE "HouseholdExpenseAllocation" ADD CONSTRAINT "HouseholdExpenseAllocation_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "HouseholdMembership"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "HouseholdSettlement" DROP CONSTRAINT "HouseholdSettlement_payerMembershipId_fkey";
ALTER TABLE "HouseholdSettlement" ADD CONSTRAINT "HouseholdSettlement_payerMembershipId_fkey" FOREIGN KEY ("payerMembershipId") REFERENCES "HouseholdMembership"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "HouseholdSettlement" DROP CONSTRAINT "HouseholdSettlement_payeeMembershipId_fkey";
ALTER TABLE "HouseholdSettlement" ADD CONSTRAINT "HouseholdSettlement_payeeMembershipId_fkey" FOREIGN KEY ("payeeMembershipId") REFERENCES "HouseholdMembership"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "HouseholdChoreAssignment" DROP CONSTRAINT "HouseholdChoreAssignment_membershipId_fkey";
ALTER TABLE "HouseholdChoreAssignment" ADD CONSTRAINT "HouseholdChoreAssignment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "HouseholdMembership"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "HouseholdChoreCompletion" DROP CONSTRAINT "HouseholdChoreCompletion_membershipId_fkey";
ALTER TABLE "HouseholdChoreCompletion" ADD CONSTRAINT "HouseholdChoreCompletion_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "HouseholdMembership"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION "protect_household_currency_change"() RETURNS trigger AS $$
BEGIN
  IF NEW."currency" <> OLD."currency" AND (
    EXISTS (SELECT 1 FROM "HouseholdExpense" WHERE "householdId" = OLD."id") OR
    EXISTS (SELECT 1 FROM "HouseholdSettlement" WHERE "householdId" = OLD."id")
  ) THEN RAISE EXCEPTION 'household currency cannot change after financial records exist';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Household_currency_immutable_after_financials"
BEFORE UPDATE OF "currency" ON "Household"
FOR EACH ROW EXECUTE FUNCTION "protect_household_currency_change"();