-- AlterTable
ALTER TABLE `AuditLog` MODIFY `note` TEXT NOT NULL DEFAULT ('');

-- AlterTable
ALTER TABLE `Bill` MODIFY `note` TEXT NOT NULL DEFAULT ('');

-- AlterTable
ALTER TABLE `EsignAttempt` MODIFY `failureReason` TEXT NOT NULL DEFAULT ('');

-- AlterTable
ALTER TABLE `Order` ADD COLUMN `rateBps` INTEGER NOT NULL DEFAULT 0,
    MODIFY `rejectReason` TEXT NOT NULL DEFAULT ('');

-- AlterTable
ALTER TABLE `PaymentRequest` MODIFY `failureReason` TEXT NOT NULL DEFAULT ('');
