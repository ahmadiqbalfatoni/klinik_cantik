import knexLib from "knex";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

const knex = knexLib({
  client: "mysql2",
  connection: {
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USERNAME || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_DATABASE || "db_klinik_kecantikan",
    port: Number(process.env.DB_PORT) || 3306,
  },
});

async function runMigration() {
  console.log("=== MEMULAI MIGRASI MULTI-BATCH PRODUK ===");
  try {
    // 1. Buat tabel mst_produk_batch jika belum ada
    const hasTable = await knex.schema.hasTable("mst_produk_batch");
    if (!hasTable) {
      await knex.schema.createTable("mst_produk_batch", (table) => {
        table.increments("id").primary();
        table.string("kode_batch", 30).notNullable().unique();
        table.string("kode_produk", 20).notNullable().index("idx_batch_produk");
        table.string("no_batch", 50).notNullable();
        table.date("tanggal_kadaluarsa").notNullable();
        table.integer("stok_masuk").notNullable().defaultTo(0);
        table.integer("stok_sisa").notNullable().defaultTo(0);
        table.decimal("harga_beli_satuan", 12, 2).notNullable().defaultTo(0.0);
        table.string("kode_supplier", 20).nullable().index("idx_batch_supplier");
        table.string("kode_po", 20).nullable().index("idx_batch_po");
        table.tinyint("is_legacy_estimate").notNullable().defaultTo(0);
        table.enum("status", ["aktif", "habis", "kadaluarsa"]).notNullable().defaultTo("aktif");
        table.string("catatan", 255).nullable();
        table.string("tz", 50).notNullable().defaultTo("UTC");
        table.string("created_by", 100).nullable();
        table.timestamp("created_at").defaultTo(knex.fn.now());
        table.string("updated_by", 100).nullable();
        table.timestamp("updated_at").defaultTo(knex.raw("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"));
        table.string("kode_cabang", 50).nullable().index("idx_batch_cabang");
        table.index(["kode_produk", "status", "tanggal_kadaluarsa"], "idx_batch_fefo");
      });
      console.log("✓ Tabel mst_produk_batch berhasil dibuat.");
    } else {
      console.log("- Tabel mst_produk_batch sudah ada.");
    }

    // 2. Tambah kolom kode_batch di trx_stok_movement jika belum ada
    const hasColMov = await knex.schema.hasColumn("trx_stok_movement", "kode_batch");
    if (!hasColMov) {
      await knex.schema.table("trx_stok_movement", (table) => {
        table.string("kode_batch", 30).nullable().after("kode_produk");
      });
      console.log("✓ Kolom kode_batch ditambahkan ke trx_stok_movement.");
    }

    // 3. Tambah kolom kode_batch, no_batch, tanggal_kadaluarsa di trx_detail_purchase_order
    const hasColPOBatch = await knex.schema.hasColumn("trx_detail_purchase_order", "kode_batch");
    if (!hasColPOBatch) {
      await knex.schema.table("trx_detail_purchase_order", (table) => {
        table.string("kode_batch", 30).nullable().after("kode_produk");
      });
      console.log("✓ Kolom kode_batch ditambahkan ke trx_detail_purchase_order.");
    }

    const hasColPONoBatch = await knex.schema.hasColumn("trx_detail_purchase_order", "no_batch");
    if (!hasColPONoBatch) {
      await knex.schema.table("trx_detail_purchase_order", (table) => {
        table.string("no_batch", 50).nullable().after("kode_batch");
        table.date("tanggal_kadaluarsa").nullable().after("no_batch");
      });
      console.log("✓ Kolom no_batch & tanggal_kadaluarsa ditambahkan ke trx_detail_purchase_order.");
    }

    // 4. Migrasi data stok existing ke mst_produk_batch sebagai legacy batch
    const existingProducts = await knex("mst_produk")
      .whereRaw("kode_produk NOT LIKE 'CUSTOM-%' AND kode_produk NOT LIKE 'CST-%'")
      .select("*");

    console.log(`Memeriksa ${existingProducts.length} master produk fisik untuk inisialisasi batch...`);

    const now = new Date();
    const oneYearLater = new Date();
    oneYearLater.setFullYear(now.getFullYear() + 1);
    const defaultExpStr = oneYearLater.toISOString().slice(0, 10);

    let migratedCount = 0;
    for (const p of existingProducts) {
      const existingBatch = await knex("mst_produk_batch").where("kode_produk", p.kode_produk).first();
      const currentStock = parseInt(p.stok_tersedia || 0, 10);

      if (!existingBatch && currentStock > 0) {
        const isEstimate = !p.tanggal_kadaluarsa;
        const expDate = p.tanggal_kadaluarsa ? String(p.tanggal_kadaluarsa).slice(0, 10) : defaultExpStr;
        const noBatchVal = p.no_batch || "BATCH-AWAL";
        const batchCode = `BTC-INIT-${p.kode_produk}`;

        await knex("mst_produk_batch").insert({
          kode_batch: batchCode,
          kode_produk: p.kode_produk,
          no_batch: noBatchVal,
          tanggal_kadaluarsa: expDate,
          stok_masuk: currentStock,
          stok_sisa: currentStock,
          harga_beli_satuan: p.harga_beli || 0,
          kode_supplier: p.kode_supplier || null,
          is_legacy_estimate: isEstimate ? 1 : 0,
          status: "aktif",
          catatan: isEstimate ? "Batch inisialisasi warisan sistem (Perkiraan expired +1 tahun, mohon diverifikasi)" : "Batch inisialisasi warisan sistem",
          tz: p.tz || "UTC",
          created_by: "system_migration",
          kode_cabang: p.kode_cabang || "CBG-001",
        });

        // Sinkronkan kembali ringkasan master produk
        await knex("mst_produk").where("id", p.id).update({
          no_batch: noBatchVal,
          tanggal_kadaluarsa: expDate,
        });

        migratedCount++;
        console.log(`  -> Berhasil migrasi [${p.kode_produk}] ${p.nama} | Batch: ${batchCode} | Stok: ${currentStock} | Exp: ${expDate} (Perkiraan: ${isEstimate})`);
      }
    }

    console.log(`✓ Migrasi selesai: ${migratedCount} produk berhasil dibuatkan batch warisan.`);
  } catch (error) {
    console.error("❌ Terjadi kesalahan saat migrasi:", error);
    process.exit(1);
  } finally {
    await knex.destroy();
  }
}

runMigration();
