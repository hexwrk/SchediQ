-- AlterTable
ALTER TABLE "Preference" ADD COLUMN     "breakMins" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "clustering" BOOLEAN NOT NULL DEFAULT true;
