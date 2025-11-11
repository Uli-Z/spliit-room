-- CreateTable
CREATE TABLE "LoginAttempt" (
    "ip" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastAttempt" TIMESTAMP(3) NOT NULL,
    "lockoutUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("ip")
);
