import DB from "../../core/config/knex.js";

async function runMigration() {
  console.log("=== MEMULAI MIGRATION: ADD OVERRIDE COLUMNS ===");

  const hasExpiredOverride = await DB.schema.hasColumn("trx_detail_transaksi", "is_expired_override");
  if (!hasExpiredOverride) {
    await DB.schema.table("trx_detail_transaksi", (table) => {
      table.tinyint("is_expired_override").notNullable().defaultTo(0).after("is_from_pendaftaran");
    });
    console.log("✓ Kolom 'is_expired_override' berhasil ditambahkan ke trx_detail_transaksi.");
  } else {
    console.log("- Kolom 'is_expired_override' sudah ada di trx_detail_transaksi.");
  }

  const hasCatatanOverride = await DB.schema.hasColumn("trx_detail_transaksi", "catatan_override");
  if (!hasCatatanOverride) {
    await DB.schema.table("trx_detail_transaksi", (table) => {
      table.text("catatan_override").nullable().after("is_expired_override");
    });
    console.log("✓ Kolom 'catatan_override' berhasil ditambahkan ke trx_detail_transaksi.");
  } else {
    console.log("- Kolom 'catatan_override' sudah ada di trx_detail_transaksi.");
  }

  const hasMovementOverride = await DB.schema.hasColumn("trx_stok_movement", "is_override_movement");
  if (!hasMovementOverride) {
    await DB.schema.table("trx_stok_movement", (table) => {
      table.tinyint("is_override_movement").notNullable().defaultTo(0).after("jenis_movement");
    });
    console.log("✓ Kolom 'is_override_movement' berhasil ditambahkan ke trx_stok_movement.");
  } else {
    console.log("- Kolom 'is_override_movement' sudah ada di trx_stok_movement.");
  }

  const hasMovementCatatan = await DB.schema.hasColumn("trx_stok_movement", "catatan");
  if (!hasMovementCatatan) {
    await DB.schema.table("trx_stok_movement", (table) => {
      table.text("catatan").nullable().after("is_override_movement");
    });
    console.log("✓ Kolom 'catatan' berhasil ditambahkan ke trx_stok_movement.");
  } else {
    console.log("- Kolom 'catatan' sudah ada di trx_stok_movement.");
  }

  // Pastikan kolom referensi memiliki kapasitas cukup untuk VOID/prefix kode
  await DB.schema.alterTable("trx_stok_movement", (table) => {
    table.string("referensi", 50).nullable().alter();
  });
  console.log("✓ Kolom 'referensi' di trx_stok_movement dipastikan VARCHAR(50).");

  console.log("=== MIGRATION SELESAI ===");
  process.exit(0);
}

runMigration().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
