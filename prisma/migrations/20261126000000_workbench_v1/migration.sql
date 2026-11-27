-- CreateTable
CREATE TABLE "WorkbenchSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "textModelId" TEXT NOT NULL DEFAULT 'gpt-6-luna',
    "imageModelId" TEXT NOT NULL DEFAULT 'gpt-image-2.6-flare',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL DEFAULT '新对话',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "imagePath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LibraryAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ComposeTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "frameNote" TEXT NOT NULL DEFAULT '',
    "productNote" TEXT NOT NULL DEFAULT '',
    "referenceNote" TEXT NOT NULL DEFAULT '',
    "referenceUse" TEXT NOT NULL DEFAULT 'frame',
    "instruction" TEXT NOT NULL DEFAULT '',
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ComposeJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL DEFAULT '做一张图',
    "instruction" TEXT NOT NULL DEFAULT '',
    "referenceUse" TEXT NOT NULL DEFAULT 'frame',
    "referenceNote" TEXT NOT NULL DEFAULT '',
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "requestWidth" INTEGER NOT NULL,
    "requestHeight" INTEGER NOT NULL,
    "sizeNote" TEXT NOT NULL DEFAULT '',
    "modelId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "error" TEXT,
    "frameCopyPath" TEXT,
    "productCopyPath" TEXT,
    "referenceCopyPath" TEXT,
    "versions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_createdAt_idx" ON "ChatMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "LibraryAsset_createdAt_idx" ON "LibraryAsset"("createdAt");

-- CreateIndex
CREATE INDEX "LibraryAsset_source_idx" ON "LibraryAsset"("source");
