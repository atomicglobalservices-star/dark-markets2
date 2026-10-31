CREATE TABLE "User" (
 "id" TEXT NOT NULL, "email" TEXT NOT NULL, "name" TEXT NOT NULL, "passwordHash" TEXT NOT NULL,
 "verified" BOOLEAN NOT NULL DEFAULT false, "role" TEXT NOT NULL DEFAULT 'USER', "plan" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'trialing', "trialEndsAt" TIMESTAMP(3) NOT NULL,
 "customerId" TEXT, "subscriptionId" TEXT, "subscriptionEndsAt" TIMESTAMP(3),
 "preferences" JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_customerId_key" ON "User"("customerId");
CREATE UNIQUE INDEX "User_subscriptionId_key" ON "User"("subscriptionId");
CREATE TABLE "Session" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Session_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Token" ("id" TEXT NOT NULL, "kind" TEXT NOT NULL, "userId" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Token_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Watchlist" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "symbol" TEXT NOT NULL, CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Watchlist_userId_symbol_key" ON "Watchlist"("userId","symbol");
CREATE TABLE "Alert" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "symbol" TEXT NOT NULL, "kind" TEXT NOT NULL DEFAULT 'price_above', "threshold" DOUBLE PRECISION NOT NULL, "email" BOOLEAN NOT NULL DEFAULT false, "triggeredAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Alert_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Notification" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "title" TEXT NOT NULL, "read" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Report" ("id" TEXT NOT NULL, "userId" TEXT, "title" TEXT NOT NULL, "question" TEXT, "content" JSONB NOT NULL, "provider" TEXT NOT NULL, "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Report_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Invoice" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "amount" INTEGER NOT NULL, "status" TEXT NOT NULL, "provider" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Job" ("id" TEXT NOT NULL, "kind" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending', "attempts" INTEGER NOT NULL DEFAULT 0, "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lockedAt" TIMESTAMP(3), "error" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Job_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Audit" ("id" TEXT NOT NULL, "actorId" TEXT NOT NULL, "action" TEXT NOT NULL, "detail" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Audit_pkey" PRIMARY KEY ("id"));
CREATE TABLE "RateLimit" ("key" TEXT NOT NULL, "count" INTEGER NOT NULL DEFAULT 1, "resetsAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key"));
CREATE TABLE "WebhookEvent" ("id" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Support" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "message" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'open', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Support_pkey" PRIMARY KEY ("id"));
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Token" ADD CONSTRAINT "Token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Support" ADD CONSTRAINT "Support_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Report_generatedAt_idx" ON "Report"("generatedAt");
CREATE INDEX "Job_runAt_idx" ON "Job"("runAt");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Token_userId_idx" ON "Token"("userId");
