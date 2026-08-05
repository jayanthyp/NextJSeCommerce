import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260805182546 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "wishlist_share" drop constraint if exists "wishlist_share_share_token_unique";`);
    this.addSql(`alter table if exists "wishlist_share" drop constraint if exists "wishlist_share_customer_id_unique";`);
    this.addSql(`create table if not exists "wishlist_item" ("id" text not null, "customer_id" text not null, "product_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "wishlist_item_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wishlist_item_deleted_at" ON "wishlist_item" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "wishlist_share" ("id" text not null, "customer_id" text not null, "share_token" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "wishlist_share_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wishlist_share_customer_id_unique" ON "wishlist_share" ("customer_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wishlist_share_share_token_unique" ON "wishlist_share" ("share_token") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wishlist_share_deleted_at" ON "wishlist_share" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "wishlist_item" cascade;`);

    this.addSql(`drop table if exists "wishlist_share" cascade;`);
  }

}
