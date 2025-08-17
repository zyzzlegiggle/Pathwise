-- CreateTable
CREATE TABLE `User` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `country` VARCHAR(191) NULL,
    `yearsExperience` DECIMAL(4, 1) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserSkill` (
    `userId` BIGINT NOT NULL,
    `skillName` VARCHAR(191) NOT NULL,
    `proficiency` INTEGER NOT NULL,
    `years` DECIMAL(4, 1) NULL,
    `lastUsed` DATETIME(3) NULL,

    PRIMARY KEY (`userId`, `skillName`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Resume` (
    `userId` BIGINT NOT NULL,
    `rawText` VARCHAR(191) NOT NULL,
    `embedding` LONGBLOB NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Job` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `source` VARCHAR(191) NOT NULL,
    `externalId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `company` VARCHAR(191) NULL,
    `location` VARCHAR(191) NULL,
    `minSalary` INTEGER NULL,
    `maxSalary` INTEGER NULL,
    `currency` VARCHAR(191) NULL DEFAULT 'USD',
    `postDate` DATETIME(3) NULL,
    `url` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JobText` (
    `jobId` BIGINT NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `embedding` LONGBLOB NULL,

    PRIMARY KEY (`jobId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Simulation` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` BIGINT NOT NULL,
    `pathName` VARCHAR(191) NOT NULL,
    `durationWeeks` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SimulationStep` (
    `simId` BIGINT NOT NULL,
    `week` INTEGER NOT NULL,
    `addedSkills` JSON NOT NULL,
    `estQualificationScore` DECIMAL(5, 2) NOT NULL,

    PRIMARY KEY (`simId`, `week`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserSkill` ADD CONSTRAINT `UserSkill_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Resume` ADD CONSTRAINT `Resume_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobText` ADD CONSTRAINT `JobText_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `Job`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Simulation` ADD CONSTRAINT `Simulation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SimulationStep` ADD CONSTRAINT `SimulationStep_simId_fkey` FOREIGN KEY (`simId`) REFERENCES `Simulation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
