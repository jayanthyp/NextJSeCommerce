import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260808171308 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "razorpay_config" ("id" text not null, "active_mode" text not null default 'test', "test_key_id" text null, "test_key_secret_encrypted" text null, "test_webhook_secret_encrypted" text null, "live_key_id" text null, "live_key_secret_encrypted" text null, "live_webhook_secret_encrypted" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "razorpay_config_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_razorpay_config_deleted_at" ON "razorpay_config" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "razorpay_config" cascade;`);
  }

}
