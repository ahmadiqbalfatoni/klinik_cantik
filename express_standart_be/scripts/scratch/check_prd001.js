import DB from "../../core/config/knex.js";
import { getProdukBatchStockInfo } from "../../routes/v1/master/inventori/batch_helper.js";

async function main() {
  const products = await DB("mst_produk").select("kode_produk", "nama", "stok_tersedia", "stok_minimum");
  console.log("=== PRODUCTS IN DB ===");
  console.log(JSON.stringify(products, null, 2));

  const batches = await DB("mst_produk_batch").select("kode_batch", "kode_produk", "no_batch", "tanggal_kadaluarsa", "stok_sisa", "status");
  console.log("=== BATCHES IN DB ===");
  console.log(JSON.stringify(batches, null, 2));

  const codes = products.map(p => p.kode_produk);
  const stockInfo = await getProdukBatchStockInfo(codes, null);
  console.log("=== getProdukBatchStockInfo ===");
  console.log(JSON.stringify(stockInfo, null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
