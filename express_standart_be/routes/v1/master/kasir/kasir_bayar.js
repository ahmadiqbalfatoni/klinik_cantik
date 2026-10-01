/**
 * @project Sistem Klinik Kecantikan
 * @file kasir_bayar.js
 * @description Endpoint proses bayar - ubah status draft menjadi lunas dan kurangi stok produk yang terjual
 */
import express from "express";
import DB from "../../../../core/config/knex.js";
import { formatDateSystem, getJakartaYmdNow } from "../../components/tools/date_tools.js";
import { Logging, ChangesLog } from "../../components/tools/servertool.js";
import { status } from "../../components/tools/general.js";
import { getBranchScope } from "../../components/tools/branch_scope.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { body } = req;
  const username = req?.auth?.username || "";
  const branchCode = getBranchScope(req, body?.kode_cabang);

  const { kode_transaksi, metode_bayar, nominal_bayar } = body;

  if (!kode_transaksi) {
    return res.status(400).json({ status: status.BAD_REQUEST, message: "kode_transaksi wajib diisi", datetime: formatDateSystem() });
  }

  const validMetode = ["tunai", "debit", "kredit", "qris", "transfer"];
  if (!validMetode.includes(metode_bayar)) {
    return res.status(400).json({ status: status.BAD_REQUEST, message: "Metode bayar tidak valid", datetime: formatDateSystem() });
  }

  try {
    let qExisting = DB("trx_transaksi").where("kode_transaksi", kode_transaksi);
    if (branchCode) {
      qExisting = qExisting.andWhere("kode_cabang", branchCode);
    }
    const existing = await qExisting.first();
    if (!existing) {
      return res.status(404).json({ status: status.BAD_REQUEST, message: "Transaksi tidak ditemukan", datetime: formatDateSystem() });
    }
    if (existing.status === "lunas") {
      return res.status(400).json({ status: status.BAD_REQUEST, message: "Transaksi sudah lunas", datetime: formatDateSystem() });
    }
    if (existing.status === "batal") {
      return res.status(400).json({ status: status.BAD_REQUEST, message: "Transaksi sudah dibatalkan", datetime: formatDateSystem() });
    }

    const totalBayar = parseFloat(existing.total_bayar || 0);
    const dpNominal = parseFloat(existing.dp_nominal || 0);
    const tagihanPelunasan = existing.sisa_bayar !== null && existing.sisa_bayar !== undefined
      ? parseFloat(existing.sisa_bayar)
      : Math.max(0, totalBayar - dpNominal);

    const nominalBayar = parseFloat(nominal_bayar !== undefined && nominal_bayar !== null ? nominal_bayar : tagihanPelunasan);

    if (metode_bayar === "tunai" && nominalBayar < tagihanPelunasan) {
      return res.status(400).json({ status: status.BAD_REQUEST, message: `Nominal bayar kurang. Diperlukan: Rp ${tagihanPelunasan.toLocaleString("id-ID")}`, datetime: formatDateSystem() });
    }

    const kembalian = metode_bayar === "tunai" ? Math.max(0, nominalBayar - tagihanPelunasan) : 0;
    const trxCabang = existing.kode_cabang || branchCode || "CBG-001";
    const nowFormatted = formatDateSystem();
    const todayStr = getJakartaYmdNow().replace(/-/g, "");

    await DB.transaction(async (trx) => {
      // 1. Update status transaksi menjadi lunas
      await trx("trx_transaksi").where("kode_transaksi", kode_transaksi).update({
        metode_bayar,
        sisa_bayar: tagihanPelunasan,
        status: "lunas",
        updated_by: username,
        updated_at: nowFormatted,
      });

      // 2. Update status kunjungan jika terkait dengan kunjungan pasien
      if (existing.kode_kunjungan) {
        await trx("trx_kunjungan").where("kode_kunjungan", existing.kode_kunjungan).update({
          status: "selesai",
          updated_by: username,
          updated_at: nowFormatted,
        });
      }

      // 3. Ambil detail transaksi untuk memotong stok produk yang terjual
      const details = await trx("trx_detail_transaksi").where("kode_transaksi", kode_transaksi);

      // Kumpulkan akumulasi kuantitas per kode_produk
      const productDeductions = new Map(); // key: kode_produk, value: qty

      for (const item of details) {
        const qty = Math.max(1, parseInt(item.qty || 1, 10));

        // a. Produk satuan langsung
        if (item.kode_produk && !item.kode_produk.startsWith("CUSTOM-") && !item.kode_produk.startsWith("CST-")) {
          const cur = productDeductions.get(item.kode_produk) || 0;
          productDeductions.set(item.kode_produk, cur + qty);
        }

        // b. Paket produk (jika ada kode_layanan atau kode_produk yang merujuk ke mst_paket_produk)
        const pktCode = (item.kode_layanan || "").startsWith("PKTPRD-")
          ? item.kode_layanan
          : (item.kode_produk || "").startsWith("PKTPRD-")
          ? item.kode_produk
          : null;

        if (pktCode) {
          const pktDetails = await trx("mst_detail_paket_produk").where("kode_paket_produk", pktCode);
          for (const pd of pktDetails) {
            if (pd.kode_produk) {
              const compQty = qty * Math.max(1, parseInt(pd.jumlah || 1, 10));
              const cur = productDeductions.get(pd.kode_produk) || 0;
              productDeductions.set(pd.kode_produk, cur + compQty);
            }
          }
        }
      }

      // Cari sequence kode_stok_movement terakhir hari ini
      const lastMov = await trx("trx_stok_movement")
        .where("kode_stok_movement", "like", `MOV-${todayStr}-%`)
        .orderBy("id", "desc")
        .first();

      let nextMovSeq = 1;
      if (lastMov && lastMov.kode_stok_movement) {
        const parts = lastMov.kode_stok_movement.split("-");
        const num = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(num)) nextMovSeq = num + 1;
      }

      // Potong stok di mst_produk dan catat di trx_stok_movement
      for (const [kodeProduk, qtyKeluar] of productDeductions.entries()) {
        let qProd = trx("mst_produk").where("kode_produk", kodeProduk);
        if (trxCabang) {
          qProd = qProd.andWhere(function () {
            this.where("kode_cabang", trxCabang).orWhereNull("kode_cabang");
          });
        }
        const produk = await qProd.first();

        if (produk) {
          const stokSebelum = parseInt(produk.stok_tersedia || 0, 10);
          const stokSesudah = Math.max(0, stokSebelum - qtyKeluar);

          await trx("mst_produk").where("id", produk.id).update({
            stok_tersedia: stokSesudah,
            updated_by: username,
            updated_at: nowFormatted,
          });

          const kodeMovement = `MOV-${todayStr}-${String(nextMovSeq).padStart(3, "0")}`;
          nextMovSeq++;

          const oMovement = {
            kode_cabang: trxCabang,
            kode_stok_movement: kodeMovement,
            kode_produk: kodeProduk,
            jenis_movement: "keluar",
            referensi: kode_transaksi,
            qty: qtyKeluar,
            stok_sebelum: stokSebelum,
            stok_sesudah: stokSesudah,
            tanggal: nowFormatted,
            tz: "Asia/Jakarta",
            created_by: username,
            created_at: nowFormatted,
            updated_by: username,
            updated_at: nowFormatted,
          };

          await trx("trx_stok_movement").insert(oMovement);

          await ChangesLog(
            {
              description: `Penjualan Kasir ${kode_transaksi}: Produk ${kodeProduk} (${produk.nama || ''}) keluar -${qtyKeluar} (stok: ${stokSebelum} -> ${stokSesudah})`,
              tableName: "mst_produk",
              referenceCode: kodeProduk,
              action: "UPDATE",
              dataBefore: { stok_tersedia: stokSebelum },
              dataAfter: { stok_tersedia: stokSesudah, kode_transaksi, qty: qtyKeluar },
              user: username,
              tz: "Asia/Jakarta",
            },
            trx
          );
        }
      }
    });

    return res.status(200).json({
      status: status.SUKSES,
      message: "Pembayaran berhasil dan stok produk telah diperbarui",
      datetime: formatDateSystem(),
      data: {
        kode_transaksi,
        metode_bayar,
        kode_promo: existing.kode_promo || null,
        nama_promo: existing.nama_promo || null,
        total_harga: parseFloat(existing.total_harga || 0),
        total_diskon: parseFloat(existing.total_diskon || 0),
        total_bayar: totalBayar,
        dp_nominal: dpNominal,
        metode_pembayaran_dp: existing.metode_pembayaran_dp || null,
        sisa_bayar: tagihanPelunasan,
        nominal_bayar: nominalBayar,
        kembalian,
      },
    });
  } catch (error) {
    const oResult = {
      status: status.BAD_REQUEST,
      message: "Sistem sedang maintenance harap tunggu sebentar",
      datetime: formatDateSystem(),
    };
    Logging(error, { file: "/master/kasir/kasir_bayar.js", user: username });
    return res.status(500).json(oResult);
  }
});

export default router;
