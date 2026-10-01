import DB from '../../core/config/knex.js';

async function clearAllAntrian() {
  console.log("=== Checking current antrian data ===");
  
  const antrianLayananCount = await DB('trx_antrian_layanan').count('id as cnt').first();
  console.log(`Total trx_antrian_layanan: ${antrianLayananCount.cnt}`);
  
  const antrianAwalCount = await DB('trx_antrian_awal').count('id as cnt').first();
  console.log(`Total trx_antrian_awal: ${antrianAwalCount.cnt}`);

  const deletedAntrianLayanan = await DB('trx_antrian_layanan').del();
  console.log(`Deleted ${deletedAntrianLayanan} rows from trx_antrian_layanan.`);

  const deletedAntrianAwal = await DB('trx_antrian_awal').del();
  console.log(`Deleted ${deletedAntrianAwal} rows from trx_antrian_awal.`);

  // Update kunjungan to 'selesai' if any are not finished
  const updatedKunjungan = await DB('trx_kunjungan')
    .whereIn('status', ['menunggu', 'dalam_pelayanan', 'antrian'])
    .update({ status: 'selesai' });
  console.log(`Updated ${updatedKunjungan} active visits to 'selesai'.`);

  console.log("\n=== ALL ROOM QUEUES ARE NOW 100% EMPTY & RESET ===");
  process.exit(0);
}

clearAllAntrian().catch(err => {
  console.error("Error clearing antrian:", err);
  process.exit(1);
});
