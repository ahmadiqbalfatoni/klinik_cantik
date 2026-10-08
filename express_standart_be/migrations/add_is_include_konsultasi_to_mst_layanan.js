/**
 * @copyright (c) 2026 PT Marstech Global (info@marstech.co.id)
 * @project Sistem Klinik Kecantikan
 * @file add_is_include_konsultasi_to_mst_layanan.js
 * @description Migration untuk menambahkan kolom is_include_konsultasi pada tabel mst_layanan
 */

import DB from "../core/config/knex.js";

export async function up(knex = DB) {
  try {
    const hasColLayanan = await knex.schema.hasColumn("mst_layanan", "is_include_konsultasi");
    if (!hasColLayanan) {
      await knex.schema.table("mst_layanan", (table) => {
        table.tinyint("is_include_konsultasi", 1).defaultTo(0).notNullable().comment("1 = Harga tindakan sudah include/gratis biaya konsultasi dokter di awal, 0 = Tidak include (bayar terpisah)");
      });
      console.log("Migration SUCCESS: Added is_include_konsultasi column to mst_layanan.");
    } else {
      console.log("Migration SKIPPED: Column is_include_konsultasi already exists in mst_layanan.");
    }

    const hasColPaket = await knex.schema.hasColumn("mst_paket_layanan", "is_include_konsultasi");
    if (!hasColPaket) {
      await knex.schema.table("mst_paket_layanan", (table) => {
        table.tinyint("is_include_konsultasi", 1).defaultTo(0).notNullable().comment("1 = Harga paket sudah include/gratis biaya konsultasi dokter di awal, 0 = Tidak include");
      });
      console.log("Migration SUCCESS: Added is_include_konsultasi column to mst_paket_layanan.");
    }
  } catch (error) {
    console.error("Migration ERROR in add_is_include_konsultasi_to_mst_layanan:", error);
    throw error;
  }
}

export async function down(knex = DB) {
  try {
    const hasColLayanan = await knex.schema.hasColumn("mst_layanan", "is_include_konsultasi");
    if (hasColLayanan) {
      await knex.schema.table("mst_layanan", (table) => {
        table.dropColumn("is_include_konsultasi");
      });
      console.log("Rollback SUCCESS: Dropped is_include_konsultasi from mst_layanan.");
    }

    const hasColPaket = await knex.schema.hasColumn("mst_paket_layanan", "is_include_konsultasi");
    if (hasColPaket) {
      await knex.schema.table("mst_paket_layanan", (table) => {
        table.dropColumn("is_include_konsultasi");
      });
      console.log("Rollback SUCCESS: Dropped is_include_konsultasi from mst_paket_layanan.");
    }
  } catch (error) {
    console.error("Rollback ERROR in add_is_include_konsultasi_to_mst_layanan:", error);
    throw error;
  }
}

// Auto-run if executed directly via node
if (process.argv[1]?.includes("add_is_include_konsultasi_to_mst_layanan")) {
  up().then(() => process.exit(0)).catch(() => process.exit(1));
}
