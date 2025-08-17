-- DropIndex
DROP INDEX `Job_source_externalId_key` ON `Job`;

-- AlterTable
ALTER TABLE `JobText` MODIFY `description` LONGTEXT NOT NULL;
