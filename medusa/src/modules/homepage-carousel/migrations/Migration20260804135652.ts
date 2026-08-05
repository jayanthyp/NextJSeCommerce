import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260804135652 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "carousel_slide" ("id" text not null, "image_url" text not null, "headline" text not null, "subtext" text null, "cta_text" text null, "cta_link" text null, "rank" integer not null default 0, "is_active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "carousel_slide_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_carousel_slide_deleted_at" ON "carousel_slide" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "carousel_slide" cascade;`);
  }

}
