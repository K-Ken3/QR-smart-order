-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'UNPAID', 'REFUNDED');

-- AlterTable
ALTER TABLE "Request" ADD COLUMN "totalAmount" DECIMAL(10,2),
ADD COLUMN "paymentStatus" "PaymentStatus" DEFAULT 'UNPAID',
ADD COLUMN "receiptNumber" TEXT,
ADD COLUMN "paidAt" TIMESTAMP(3);
