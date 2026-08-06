import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260806124112 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "back_in_stock_request" ("id" text not null, "customer_id" text not null, "variant_id" text not null, "product_id" text not null, "notified_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "back_in_stock_request_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_back_in_stock_request_deleted_at" ON "back_in_stock_request" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "back_in_stock_request" cascade;`);
  }

}
