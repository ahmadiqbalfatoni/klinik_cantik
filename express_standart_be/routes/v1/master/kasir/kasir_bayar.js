/**
 * @project Sistem Klinik Kecantikan
 * @file kasir_bayar.js
 * @description Endpoint proses bayar - ubah status draft menjadi lunas dan eksekusi pemotongan stok FEFO
 */
import express from "express";
import DB from "../../../../core/config/knex.js";
import { formatDateSystem } from "../../components/tools/date_tools.js";
import { Logging } from "../../components/tools/servertool.js";
import { status } from "../../components/tools/general.js";
import { getBranchScope } from "../../components/tools/branch_scope.js";
import { deductStockFEFO } from "../inventori/batch_helper.js";

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

  const trx = await DB.transaction();

  try {
    let qExisting = trx("trx_transaksi").where("kode_transaksi", kode_transaksi);
    if (branchCode) {
      qExisting = qExisting.andWhere("kode_cabang", branchCode);
    }
    const existing = await qExisting.forUpdate().first();
    if (!existing) {
      await trx.rollback();
      return res.status(404).json({ status: status.BAD_REQUEST, message: "Transaksi tidak ditemukan", datetime: formatDateSystem() });
    }
    if (existing.status === "lunas") {
      await trx.rollback();
      return res.status(400).json({ status: status.BAD_REQUEST, message: "Transaksi sudah lunas", datetime: formatDateSystem() });
    }
    if (existing.status === "batal") {
      await trx.rollback();
      return res.status(400).json({ status: status.BAD_REQUEST, message: "Transaksi sudah dibatalkan", datetime: formatDateSystem() });
    }

    const totalBayar = parseFloat(existing.total_bayar || 0);
    const dpNominal = parseFloat(existing.dp_nominal || 0);
    const tagihanPelunasan = existing.sisa_bayar !== null && existing.sisa_bayar !== undefined
      ? parseFloat(existing.sisa_bayar)
      : Math.max(0, totalBayar - dpNominal);

    const nominalBayar = parseFloat(nominal_bayar !== undefined && nominal_bayar !== null ? nominal_bayar : tagihanPelunasan);

    if (metode_bayar === "tunai" && nominalBayar < tagihanPelunasan) {
      await trx.rollback();
      return res.status(400).json({ status: status.BAD_REQUEST, message: `Nominal bayar kurang. Diperlukan: Rp ${tagihanPelunasan.toLocaleString("id-ID")}`, datetime: formatDateSystem() });
    }

    const kembalian = metode_bayar === "tunai" ? Math.max(0, nominalBayar - tagihanPelunasan) : 0;
    const trxBranch = existing.kode_cabang || branchCode || "CBG-001";

    // 1. Eksekusi pemotongan stok FEFO untuk semua item produk fisik pada transaksi
    const detailItems = await trx("trx_detail_transaksi")
      .where("kode_transaksi", kode_transaksi)
      .whereNotNull("kode_produk");

    for (const item of detailItems) {
      if (item.kode_produk && !item.kode_produk.startsWith("CUSTOM-") && !item.kode_produk.startsWith("CST-")) {
        await deductStockFEFO({
          kode_produk: item.kode_produk,
          qty: parseInt(item.qty || 1, 10),
          kode_transaksi: kode_transaksi,
          username: username,
          branchCode: trxBranch,
          tz: existing.tz || "UTC",
          allowExpiredOverride: Boolean(item.is_expired_override),
          catatanOverride: item.catatan_override || null,
          trx: trx,
        });
      }
    }

    // 2. Update status transaksi menjadi lunas
    await trx("trx_transaksi").where("kode_transaksi", kode_transaksi).update({
      metode_bayar,
      sisa_bayar: tagihanPelunasan,
      status: "lunas",
      updated_by: username,
      updated_at: DB.fn.now(),
    });

    // 2b. Integrasi Sesi Shift Kasir: Catat ke shift aktif kasir jika ada
    try {
      const userCode = req?.auth?.user_code || "";
      const activeShift = await trx("trx_kasir_shift")
        .where(function () {
          if (userCode) this.where("user_code", userCode);
          else this.where("created_by", username);
        })
        .where("status", "open")
        .forUpdate()
        .first();

      if (activeShift) {
        const nowWib = formatDateSystem();
        const payNominal = tagihanPelunasan > 0 ? tagihanPelunasan : totalBayar;

        if (metode_bayar === "tunai") {
          const newTunai = parseFloat(activeShift.total_penjualan_tunai || 0) + payNominal;
          const newKasDiharapkan = parseFloat(activeShift.kas_diharapkan || 0) + payNominal;

          await trx("trx_kasir_shift").where("id", activeShift.id).update({
            total_penjualan_tunai: newTunai,
            kas_diharapkan: newKasDiharapkan,
            updated_by: username,
            updated_at: DB.fn.now(),
          });

          const countMut = await trx("trx_kasir_mutasi_kas")
            .where("kode_shift", activeShift.kode_shift)
            .count("id as total")
            .first();
          const nextMutSeq = (parseInt(countMut?.total || 0, 10) + 1).toString().padStart(3, "0");
          const kodeMutasi = `MUT-${activeShift.kode_shift.replace("SFT-", "")}-${nextMutSeq}`;

          await trx("trx_kasir_mutasi_kas").insert({
            kode_mutasi: kodeMutasi,
            kode_shift: activeShift.kode_shift,
            user_code: activeShift.user_code,
            nama_kasir: activeShift.nama_kasir,
            kode_cabang: activeShift.kode_cabang,
            tipe: "penjualan_tunai",
            kategori: `Penjualan Tunai (${kode_transaksi})`,
            nominal: payNominal,
            arus: "masuk",
            saldo_setelah: newKasDiharapkan,
            referensi: kode_transaksi,
            keterangan: `Pembayaran tunai transaksi ${kode_transaksi}`,
            created_by: username,
            created_at: nowWib,
          });
        } else {
          const newNonTunai = parseFloat(activeShift.total_penjualan_nontunai || 0) + payNominal;
          await trx("trx_kasir_shift").where("id", activeShift.id).update({
            total_penjualan_nontunai: newNonTunai,
            updated_by: username,
            updated_at: DB.fn.now(),
          });
        }
      }
    } catch (shiftErr) {
      console.warn("Peringatan: Gagal mencatat mutasi shift kasir:", shiftErr?.message);
    }

    // 3. Update kunjungan pasien menjadi selesai jika ada
    if (existing.kode_kunjungan) {
      await trx("trx_kunjungan").where("kode_kunjungan", existing.kode_kunjungan).update({
        status: "selesai",
        updated_by: username,
        updated_at: DB.fn.now(),
      });
    }

    await trx.commit();

    return res.status(200).json({
      status: status.SUKSES,
      message: "Pembayaran berhasil dan stok produk telah dipotong (FEFO)",
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
    await trx.rollback();
    const oResult = {
      status: status.BAD_REQUEST,
      message: error.message || "Sistem sedang maintenance harap tunggu sebentar",
      datetime: formatDateSystem(),
    };
    Logging(error, { file: "/master/kasir/kasir_bayar.js", user: username });
    return res.status(500).json(oResult);
  }
});

export default router;
