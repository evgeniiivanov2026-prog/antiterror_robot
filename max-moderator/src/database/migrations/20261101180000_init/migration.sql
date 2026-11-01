-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('WORD', 'REGEX', 'LINK_DOMAIN', 'SPAM_PATTERN', 'CAPS', 'FLOOD', 'MENTION_SPAM', 'MEDIA', 'FORWARD', 'CUSTOM_AI');

-- CreateEnum
CREATE TYPE "ModerationAction" AS ENUM ('DELETE', 'WARN', 'MUTE', 'KICK', 'NOTIFY_ADMINS', 'REVIEW');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "LinkMode" AS ENUM ('ALLOW', 'DENY', 'REVIEW');

-- CreateEnum
CREATE TYPE "LinkList" AS ENUM ('ALLOW', 'DENY');

-- CreateEnum
CREATE TYPE "AdminRoleName" AS ENUM ('ADMIN', 'OWNER');

-- CreateTable
CREATE TABLE "chat_settings" (
    "id" SERIAL NOT NULL,
    "chat_id" TEXT NOT NULL,
    "link_mode" "LinkMode" NOT NULL DEFAULT 'REVIEW',
    "default_action" "ModerationAction" NOT NULL DEFAULT 'DELETE',
    "language" TEXT NOT NULL DEFAULT 'ru',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "whole_word" BOOLEAN NOT NULL DEFAULT true,
    "caps_enabled" BOOLEAN NOT NULL DEFAULT true,
    "caps_ratio" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "caps_min_length" INTEGER NOT NULL DEFAULT 20,
    "flood_enabled" BOOLEAN NOT NULL DEFAULT true,
    "flood_max_messages" INTEGER NOT NULL DEFAULT 5,
    "flood_window_sec" INTEGER NOT NULL DEFAULT 10,
    "mention_enabled" BOOLEAN NOT NULL DEFAULT true,
    "mention_max" INTEGER NOT NULL DEFAULT 5,
    "repeat_enabled" BOOLEAN NOT NULL DEFAULT true,
    "repeat_max" INTEGER NOT NULL DEFAULT 3,
    "repeat_window_sec" INTEGER NOT NULL DEFAULT 120,
    "media_mode" TEXT NOT NULL DEFAULT 'off',
    "forward_mode" TEXT NOT NULL DEFAULT 'off',
    "hard_action" "ModerationAction" NOT NULL DEFAULT 'NOTIFY_ADMINS',
    "mute_minutes" INTEGER NOT NULL DEFAULT 15,
    "allow_purge" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "word_filters" (
    "id" SERIAL NOT NULL,
    "chat_id" TEXT NOT NULL,
    "type" "RuleType" NOT NULL,
    "pattern" TEXT NOT NULL,
    "action" "ModerationAction" NOT NULL,
    "severity" "Severity" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
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
    "action" "ModerationAction" NOT NULL DEFAULT 'DELETE',
    "note" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "link_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_whitelist" (
    "id" SERIAL NOT NULL,
    "chat_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_whitelist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "violations" (
    "id" SERIAL NOT NULL,
    "chat_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "rule_id" INTEGER,
    "violation_type" "RuleType" NOT NULL,
    "severity" "Severity" NOT NULL,
    "action" "ModerationAction" NOT NULL,
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
    "id" SERIAL NOT NULL,
    "chat_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "AdminRoleName" NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "id" SERIAL NOT NULL,
    "chat_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_restrictions" (
    "id" SERIAL NOT NULL,
    "chat_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "until" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_restrictions_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "user_whitelist_chat_id_user_id_key" ON "user_whitelist"("chat_id", "user_id");

-- CreateIndex
CREATE INDEX "violations_chat_id_user_id_created_at_idx" ON "violations"("chat_id", "user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "violations_chat_id_message_id_content_hash_key" ON "violations"("chat_id", "message_id", "content_hash");

-- CreateIndex
CREATE INDEX "audit_logs_chat_id_created_at_idx" ON "audit_logs"("chat_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_roles_chat_id_user_id_key" ON "admin_roles"("chat_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "processed_events_chat_id_message_id_content_hash_key" ON "processed_events"("chat_id", "message_id", "content_hash");

-- CreateIndex
CREATE INDEX "user_restrictions_chat_id_user_id_idx" ON "user_restrictions"("chat_id", "user_id");

