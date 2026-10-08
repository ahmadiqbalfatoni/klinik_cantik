import knexLib from "knex";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

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
  console.log("=== MEMULAI MIGRASI SESI SHIFT KASIR & MUTASI KAS ===");
  try {
    const hasShift = await knex.schema.hasTable("trx_kasir_shift");
    if (!hasShift) {
      await knex.schema.createTable("trx_kasir_shift", (table) => {
        table.increments("id").primary();
        table.string("kode_shift", 30).notNullable().unique();
        table.string("user_code", 50).notNullable().index("idx_shift_user_code");
        table.string("nama_kasir", 150).notNullable();
        table.string("kode_cabang", 50).nullable().index("idx_shift_cabang");
        table.datetime("waktu_buka").notNullable();
        table.datetime("waktu_tutup").nullable();
        table.decimal("modal_awal", 15, 2).notNullable().defaultTo(0);
        table.decimal("total_penjualan_tunai", 15, 2).notNullable().defaultTo(0);
        table.decimal("total_penjualan_nontunai", 15, 2).notNullable().defaultTo(0);
        table.decimal("total_kas_masuk_lain", 15, 2).notNullable().defaultTo(0);
        table.decimal("total_kas_keluar", 15, 2).notNullable().defaultTo(0);
        table.decimal("kas_diharapkan", 15, 2).notNullable().defaultTo(0);
        table.decimal("kas_aktual", 15, 2).nullable();
        table.decimal("selisih", 15, 2).nullable();
        table.enum("status", ["open", "closed"]).notNullable().defaultTo("open").index("idx_shift_status");
        table.text("catatan_buka").nullable();
        table.text("catatan_tutup").nullable();
        table.string("created_by", 100).nullable();
        table.timestamp("created_at").defaultTo(knex.fn.now());
        table.string("updated_by", 100).nullable();
        table.timestamp("updated_at").defaultTo(knex.raw("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"));
      });
      console.log("✓ Tabel trx_kasir_shift berhasil dibuat.");
    } else {
      console.log("- Tabel trx_kasir_shift sudah ada.");
    }

    const hasMutasi = await knex.schema.hasTable("trx_kasir_mutasi_kas");
    if (!hasMutasi) {
      await knex.schema.createTable("trx_kasir_mutasi_kas", (table) => {
        table.increments("id").primary();
        table.string("kode_mutasi", 30).notNullable().unique();
        table.string("kode_shift", 30).notNullable().index("idx_mutasi_shift");
        table.string("user_code", 50).notNullable().index("idx_mutasi_user");
        table.string("nama_kasir", 150).notNullable();
        table.string("kode_cabang", 50).nullable().index("idx_mutasi_cabang");
        table.enum("tipe", ["modal_awal", "penjualan_tunai", "kas_masuk", "kas_keluar", "tutup_shift"]).notNullable();
        table.string("kategori", 100).nullable();
        table.decimal("nominal", 15, 2).notNullable().defaultTo(0);
        table.enum("arus", ["masuk", "keluar"]).notNullable();
        table.decimal("saldo_setelah", 15, 2).notNullable().defaultTo(0);
        table.string("referensi", 100).nullable();
        table.text("keterangan").nullable();
        table.string("created_by", 100).nullable();
        table.timestamp("created_at").defaultTo(knex.fn.now());
      });
      console.log("✓ Tabel trx_kasir_mutasi_kas berhasil dibuat.");
    } else {
      console.log("- Tabel trx_kasir_mutasi_kas sudah ada.");
    }

    console.log("=== MIGRASI SELESAI DENGAN SUKSES ===");
  } catch (error) {
    console.error("❌ Kesalahan migrasi:", error);
    process.exit(1);
  } finally {
    await knex.destroy();
  }
}

runMigration();
