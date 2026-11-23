-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(64) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `role` VARCHAR(32) NOT NULL,
    `storeId` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Store` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `city` VARCHAR(80) NOT NULL DEFAULT '',
    `type` VARCHAR(32) NOT NULL DEFAULT 'partner',
    `status` VARCHAR(32) NOT NULL DEFAULT 'active',
    `rating` CHAR(1) NOT NULL DEFAULT 'A',
    `address` VARCHAR(500) NOT NULL DEFAULT '',
    `contact` VARCHAR(100) NOT NULL DEFAULT '',
    `phone` VARCHAR(32) NOT NULL DEFAULT '',
    `agreement` VARCHAR(32) NOT NULL DEFAULT 'pending',
    `payee` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Store_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Customer` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `idType` VARCHAR(32) NOT NULL DEFAULT 'CCCD',
    `idNo` VARCHAR(64) NOT NULL,
    `phone` VARCHAR(32) NOT NULL,
    `birthDate` VARCHAR(10) NOT NULL DEFAULT '',
    `gender` VARCHAR(16) NOT NULL DEFAULT '',
    `address` VARCHAR(500) NOT NULL,
    `currentAddress` VARCHAR(500) NOT NULL DEFAULT '',
    `workCompany` VARCHAR(200) NOT NULL DEFAULT '',
    `workPhone` VARCHAR(32) NOT NULL DEFAULT '',
    `emergencyName` VARCHAR(100) NOT NULL,
    `emergencyRelation` VARCHAR(64) NOT NULL,
    `emergencyPhone` VARCHAR(32) NOT NULL,
    `secondName` VARCHAR(100) NOT NULL DEFAULT '',
    `secondPhone` VARCHAR(32) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Customer_idNo_idx`(`idNo`),
    INDEX `Customer_phone_idx`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Order` (
    `id` VARCHAR(191) NOT NULL,
    `orderNo` VARCHAR(40) NOT NULL,
    `status` VARCHAR(40) NOT NULL DEFAULT 'draft',
    `customerId` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `salesId` VARCHAR(191) NULL,
    `salesName` VARCHAR(100) NOT NULL,
    `source` VARCHAR(40) NOT NULL DEFAULT 'sales',
    `urgent` BOOLEAN NOT NULL DEFAULT false,
    `docs` JSON NOT NULL,
    `device` JSON NOT NULL,
    `checks` JSON NULL,
    `payee` JSON NOT NULL,
    `price` BIGINT NOT NULL,
    `downPayment` BIGINT NOT NULL DEFAULT 0,
    `principal` BIGINT NOT NULL,
    `periods` INTEGER NOT NULL,
    `perPeriod` BIGINT NOT NULL,
    `firstDueDate` DATE NOT NULL,
    `rejectReason` TEXT NOT NULL DEFAULT (''),
    `firstReview` JSON NULL,
    `finalReview` JSON NULL,
    `financeReview` JSON NULL,
    `payoutAt` DATETIME(3) NULL,
    `payoutRef` VARCHAR(128) NULL,
    `payoutBy` VARCHAR(100) NULL,
    `submittedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Order_orderNo_key`(`orderNo`),
    UNIQUE INDEX `Order_customerId_key`(`customerId`),
    INDEX `Order_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `Order_storeId_status_idx`(`storeId`, `status`),
    INDEX `Order_salesId_status_idx`(`salesId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MdmRecord` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `serial` VARCHAR(128) NOT NULL,
    `imei` VARCHAR(64) NOT NULL,
    `bound` BOOLEAN NOT NULL DEFAULT true,
    `provider` VARCHAR(40) NOT NULL DEFAULT 'zhunfu_manual',
    `boundAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `boundBy` VARCHAR(100) NOT NULL,
    `releasedAt` DATETIME(3) NULL,
    `releasedBy` VARCHAR(100) NULL,
    `releaseNote` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MdmRecord_orderId_key`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Bill` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `period` INTEGER NOT NULL,
    `dueDate` DATE NOT NULL,
    `amount` BIGINT NOT NULL,
    `paidAmount` BIGINT NOT NULL DEFAULT 0,
    `status` VARCHAR(24) NOT NULL DEFAULT 'Pending',
    `paidAt` DATETIME(3) NULL,
    `channel` VARCHAR(40) NULL,
    `txnNo` VARCHAR(128) NULL,
    `note` TEXT NOT NULL DEFAULT (''),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Bill_dueDate_status_idx`(`dueDate`, `status`),
    INDEX `Bill_status_dueDate_idx`(`status`, `dueDate`),
    UNIQUE INDEX `Bill_orderId_period_key`(`orderId`, `period`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentRequest` (
    `id` VARCHAR(191) NOT NULL,
    `requestNo` VARCHAR(64) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `billId` VARCHAR(191) NOT NULL,
    `amount` BIGINT NOT NULL,
    `channel` VARCHAR(40) NOT NULL,
    `status` VARCHAR(24) NOT NULL DEFAULT 'pending',
    `provider` VARCHAR(40) NOT NULL,
    `externalTxnNo` VARCHAR(128) NULL,
    `isMock` BOOLEAN NOT NULL DEFAULT false,
    `paidAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `rawResponse` JSON NULL,
    `failureReason` TEXT NOT NULL DEFAULT (''),
    `actorName` VARCHAR(100) NOT NULL DEFAULT '系统',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PaymentRequest_requestNo_key`(`requestNo`),
    INDEX `PaymentRequest_orderId_status_idx`(`orderId`, `status`),
    INDEX `PaymentRequest_billId_status_idx`(`billId`, `status`),
    UNIQUE INDEX `PaymentRequest_channel_externalTxnNo_key`(`channel`, `externalTxnNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EsignAttempt` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `attempt` INTEGER NOT NULL,
    `provider` VARCHAR(40) NOT NULL,
    `externalContractNo` VARCHAR(128) NULL,
    `status` VARCHAR(24) NOT NULL DEFAULT 'pending',
    `providerStatus` VARCHAR(80) NOT NULL DEFAULT '',
    `failureReason` TEXT NOT NULL DEFAULT (''),
    `pdfUrl` VARCHAR(1000) NULL,
    `rawCallback` JSON NULL,
    `isMock` BOOLEAN NOT NULL DEFAULT false,
    `actorName` VARCHAR(100) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EsignAttempt_orderId_status_idx`(`orderId`, `status`),
    UNIQUE INDEX `EsignAttempt_orderId_attempt_key`(`orderId`, `attempt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NULL,
    `storeId` VARCHAR(191) NULL,
    `actorId` VARCHAR(191) NULL,
    `actorName` VARCHAR(100) NOT NULL,
    `actorRole` VARCHAR(32) NOT NULL,
    `action` VARCHAR(100) NOT NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `note` TEXT NOT NULL DEFAULT (''),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_orderId_createdAt_idx`(`orderId`, `createdAt`),
    INDEX `AuditLog_storeId_createdAt_idx`(`storeId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_salesId_fkey` FOREIGN KEY (`salesId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MdmRecord` ADD CONSTRAINT `MdmRecord_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Bill` ADD CONSTRAINT `Bill_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentRequest` ADD CONSTRAINT `PaymentRequest_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentRequest` ADD CONSTRAINT `PaymentRequest_billId_fkey` FOREIGN KEY (`billId`) REFERENCES `Bill`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EsignAttempt` ADD CONSTRAINT `EsignAttempt_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `Store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
