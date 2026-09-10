CREATE TYPE "HouseholdRecipeImportMethod" AS ENUM ('url', 'image');

ALTER TABLE "HouseholdRecipe"
  ADD COLUMN "sourceUrl" TEXT,
  ADD COLUMN "importMethod" "HouseholdRecipeImportMethod";