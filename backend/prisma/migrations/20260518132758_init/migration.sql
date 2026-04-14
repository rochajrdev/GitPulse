-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "webhookToken" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EmailAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailAlias_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Commit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hash" TEXT,
    "message" TEXT,
    "authorEmail" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "repository" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Commit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_webhookToken_key" ON "User"("webhookToken");

-- CreateIndex
CREATE UNIQUE INDEX "EmailAlias_email_key" ON "EmailAlias"("email");

-- CreateIndex
CREATE INDEX "Commit_userId_idx" ON "Commit"("userId");

-- CreateIndex
CREATE INDEX "Commit_timestamp_idx" ON "Commit"("timestamp");
