-- CreateTable
CREATE TABLE "chat_settings" (
    "chat_id" TEXT NOT NULL,
    "link_mode" TEXT NOT NULL DEFAULT 'review',
    "default_action" TEXT NOT NULL DEFAULT 'DELETE',
    "language" TEXT NOT NULL DEFAULT 'ru',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "whole_word" BOOLEAN NOT NULL DEFAULT true,
    "purge_enabled" BOOLEAN NOT NULL DEFAULT false,
    "hard_action" TEXT NOT NULL DEFAULT 'NOTIFY_ADMINS',
    "caps_ratio" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "caps_min_length" INTEGER NOT NULL DEFAULT 20,
    "flood_limit" INTEGER NOT NULL DEFAULT 8,
    "flood_window_ms" INTEGER NOT NULL DEFAULT 10000,
    "repeat_limit" INTEGER NOT NULL DEFAULT 3,
    "mention_limit" INTEGER NOT NULL DEFAULT 5,
    "moderate_caps" BOOLEAN NOT NULL DEFAULT true,
    "moderate_flood" BOOLEAN NOT NULL DEFAULT true,
    "moderate_mentions" BOOLEAN NOT NULL DEFAULT true,
    "moderate_media" BOOLEAN NOT NULL DEFAULT false,
    "moderate_forwards" BOOLEAN NOT NULL DEFAULT false,
    "lexicon_seeded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_settings_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "word_filters" (
    "id" SERIAL NOT NULL,
    "chat_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "whole_word" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "word_filters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "link_rules" (
    "id" SERIAL NOT NULL,
    "chat_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "list" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "link_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_whitelist" (
    "chat_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reason" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_whitelist_pkey" PRIMARY KEY ("chat_id","user_id")
);

-- CreateTable
CREATE TABLE "violations" (
    "id" SERIAL NOT NULL,
    "chat_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "rule_id" INTEGER,
    "violation_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "violations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "chat_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "target_user_id" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_roles" (
    "chat_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("chat_id","user_id")
);

-- CreateIndex
CREATE INDEX "word_filters_chat_id_enabled_idx" ON "word_filters"("chat_id", "enabled");

-- CreateIndex
CREATE INDEX "link_rules_chat_id_idx" ON "link_rules"("chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "link_rules_chat_id_domain_key" ON "link_rules"("chat_id", "domain");

-- CreateIndex
CREATE INDEX "violations_chat_id_user_id_created_at_idx" ON "violations"("chat_id", "user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "violations_chat_id_message_id_key" ON "violations"("chat_id", "message_id");

-- CreateIndex
CREATE INDEX "audit_logs_chat_id_created_at_idx" ON "audit_logs"("chat_id", "created_at");
