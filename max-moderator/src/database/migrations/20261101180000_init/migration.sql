-- CreateEnum
CREATE TYPE "FilterType" AS ENUM ('WORD', 'REGEX', 'LINK_DOMAIN', 'SPAM_PATTERN', 'CAPS', 'FLOOD', 'MENTION_SPAM', 'MEDIA', 'FORWARD', 'CUSTOM_AI');

-- CreateEnum
CREATE TYPE "ModerationAction" AS ENUM ('DELETE', 'WARN', 'MUTE', 'KICK', 'NOTIFY_ADMINS', 'REVIEW');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "LinkMode" AS ENUM ('allow', 'deny', 'review');

-- CreateEnum
CREATE TYPE "LinkList" AS ENUM ('whitelist', 'blacklist');

-- CreateEnum
CREATE TYPE "AdminRoleName" AS ENUM ('ADMIN', 'OWNER');

-- CreateTable
CREATE TABLE "chat_settings" (
    "chat_id" TEXT NOT NULL,
    "link_mode" "LinkMode" NOT NULL DEFAULT 'review',
    "default_action" "ModerationAction" NOT NULL DEFAULT 'DELETE',
    "language" TEXT NOT NULL DEFAULT 'ru',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "whole_word" BOOLEAN NOT NULL DEFAULT true,
    "purge_enabled" BOOLEAN NOT NULL DEFAULT false,
    "spam_enabled" BOOLEAN NOT NULL DEFAULT true,
    "caps_enabled" BOOLEAN NOT NULL DEFAULT true,
    "hard_action" TEXT NOT NULL DEFAULT 'none',
    "caps_ratio" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "caps_min_length" INTEGER NOT NULL DEFAULT 20,
    "flood_max" INTEGER NOT NULL DEFAULT 5,
    "flood_window_sec" INTEGER NOT NULL DEFAULT 10,
    "mention_max" INTEGER NOT NULL DEFAULT 5,
    "duplicate_threshold" INTEGER NOT NULL DEFAULT 3,
    "mute_seconds" INTEGER NOT NULL DEFAULT 600,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_settings_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "word_filters" (
    "id" SERIAL NOT NULL,
    "chat_id" TEXT NOT NULL,
    "type" "FilterType" NOT NULL,
    "pattern" TEXT NOT NULL,
    "action" "ModerationAction" NOT NULL,
    "severity" "Severity" NOT NULL,
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
    "list" "LinkList" NOT NULL,
    "action" "ModerationAction" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

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
    "severity" "Severity" NOT NULL,
    "action" "ModerationAction" NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "violations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
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
    "role" "AdminRoleName" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("chat_id","user_id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "id" BIGSERIAL NOT NULL,
    "chat_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_settings_chat_id_key" ON "chat_settings"("chat_id");

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

-- CreateIndex
CREATE UNIQUE INDEX "processed_events_event_key_key" ON "processed_events"("event_key");

-- CreateIndex
CREATE INDEX "processed_events_chat_id_message_id_idx" ON "processed_events"("chat_id", "message_id");

-- CreateIndex
CREATE INDEX "processed_events_created_at_idx" ON "processed_events"("created_at");

