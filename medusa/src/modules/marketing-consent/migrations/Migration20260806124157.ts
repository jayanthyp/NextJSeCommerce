import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260806124157 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "marketing_consent" drop constraint if exists "marketing_consent_email_unique";`);
    this.addSql(`create table if not exists "marketing_consent" ("id" text not null, "email" text not null, "opted_in_at" timestamptz not null, "source" text not null, "order_id" text null, "mailerlite_synced_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "marketing_consent_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_marketing_consent_email_unique" ON "marketing_consent" ("email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_marketing_consent_deleted_at" ON "marketing_consent" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "marketing_consent" cascade;`);
  }

}
