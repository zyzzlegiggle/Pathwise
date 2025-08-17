/*
  Warnings:

  - A unique constraint covering the columns `[source,externalId]` on the table `Job` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `Job_source_externalId_key` ON `Job`(`source`, `externalId`);
