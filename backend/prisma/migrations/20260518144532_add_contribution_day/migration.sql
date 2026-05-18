-- CreateTable
CREATE TABLE "ContributionDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'github',
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContributionDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ContributionDay_userId_idx" ON "ContributionDay"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ContributionDay_userId_date_source_key" ON "ContributionDay"("userId", "date", "source");
