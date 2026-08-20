-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "otpCode" TEXT,
ADD COLUMN     "otpExpiry" TIMESTAMP(3),
ADD COLUMN     "stripeCustomerId" TEXT;
