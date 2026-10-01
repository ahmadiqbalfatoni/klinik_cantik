/**
 * @copyright (c) 2026 PT Marstech Global (info@marstech.co.id)
 * @project Sistem Klinik
 * @file pendaftaran_pasien_layanan_options.js
 * @description Endpoint untuk mengambil pilihan layanan aktif (per kategori) dan paket layanan aktif
 *
 * @author Antigravity
 * @created 2026-08-21
 */

import express from "express";
import DB from "../../../../core/config/knex.js";
import { formatDateSystem } from "../../components/tools/date_tools.js";
import { Logging } from "../../components/tools/servertool.js";
import { status } from "../../components/tools/general.js";
import { getBranchScope } from "../../components/tools/branch_scope.js";

const router = express.Router();

const handleGetOptions = async (req, res) => {
  const oPayload = { ...req.query, ...req.body };
  const username = req?.auth?.username || "";
  const branchCode = getBranchScope(req, oPayload.kode_cabang);
  const assetsBase = process.env.ASSETS_PATH || "/api/assets";

  try {
    // 1. Fetch ALL ruangan aktif from DB
    const qRuangan = DB("mst_ruangan").where("status", "aktif");
    if (branchCode) qRuangan.where("kode_cabang", branchCode);
    const vaRuangan = await qRuangan
      .select("kode_ruangan", "nama_ruangan", "is_konsultasi")
      .orderBy("nama_ruangan", "asc");

    // 2. Tentukan nama hari ini (WIB / sistem)
    const HARI_MAP = ["minggu", "senin", "selasa", "rabu", "kamis", "jumat", "sabtu"];
    const todayStr = formatDateSystem(new Date(), "yyyy-MM-dd");
    const [year, month, day] = todayStr.split("-").map(Number);
    const todayDay = HARI_MAP[new Date(year, month - 1, day).getDay()];

    // 3. Ambil jadwal aktif hari ini dari mst_jadwal_karyawan
    const qSchedules = DB("mst_jadwal_karyawan as j")
      .leftJoin("mst_karyawan as k", "j.no_sip", "k.no_sip")
      .leftJoin("mst_ruangan as r", "j.kode_ruangan", "r.kode_ruangan")
      .where("j.status", "aktif")
      .where("j.hari", todayDay);

    if (branchCode) {
      qSchedules.where(function () {
        this.where("j.kode_cabang", branchCode).orWhere("k.kode_cabang", branchCode);
      });
    }

    const activeSchedulesToday = await qSchedules
      .select(
        "j.id",
        "j.kode_jadwal",
        "j.kode_ruangan",
        "r.nama_ruangan",
        "j.no_sip",
        "j.is_penanggung_jawab",
        "j.jam_mulai",
        "j.jam_selesai",
        "k.nama as nama_petugas",
        "k.jabatan as jabatan_petugas"
      )
      .orderBy("j.is_penanggung_jawab", "desc")
      .orderBy("j.jam_mulai", "asc");

    // Kelompokkan jadwal hari ini per kode_ruangan
    const roomSchedulesMap = new Map();
    activeSchedulesToday.forEach((sch) => {
      if (!roomSchedulesMap.has(sch.kode_ruangan)) {
        roomSchedulesMap.set(sch.kode_ruangan, []);
      }
      roomSchedulesMap.get(sch.kode_ruangan).push(sch);
    });

    // Identifikasi Ruang Konsultasi aktif
    const ruangKonsul = vaRuangan.find((rng) => Number(rng.is_konsultasi) === 1);
    const kodeRuanganKonsul = ruangKonsul?.kode_ruangan || "RNG-007";
    const namaRuanganKonsul = ruangKonsul?.nama_ruangan || "Ruang Konsultasi";
    const schedulesKonsul = roomSchedulesMap.get(kodeRuanganKonsul) || [];
    const hasPetugasKonsulToday = schedulesKonsul.length > 0;

    // 4. Fetch layanan aktif
    const qLayanan = DB("mst_layanan as l")
      .leftJoin("mst_kategori_layanan as k", "l.kode_kategori_layanan", "k.kode_kategori_layanan")
      .leftJoin("mst_ruangan as r", "l.kode_ruangan", "r.kode_ruangan")
      .where("l.status", "aktif");

    if (branchCode) qLayanan.where("l.kode_cabang", branchCode);

    const vaLayanan = await qLayanan
      .select(
        "l.kode_layanan",
        "l.kode_kategori_layanan",
        "k.nama as nama_kategori",
        "l.nama",
        "l.harga",
        "l.durasi_menit",
        "l.tipe",
        "l.kode_ruangan",
        "l.wajib_konsultasi",
        "l.kode_ruangan_konsultasi",
        "l.foto",
        "r.nama_ruangan as nama_ruangan",
        "r.is_konsultasi as is_konsultasi"
      )
      .orderBy("l.id", "asc");

    // Auto nonaktifkan paket yang sudah melewati tanggal_selesai
    await DB("mst_paket_layanan")
      .where("status", "aktif")
      .whereNotNull("tanggal_selesai")
      .whereRaw("DATE(tanggal_selesai) < ?", [todayStr])
      .update({
        status: "nonaktif",
        updated_at: formatDateSystem(),
      });

    // 5. Fetch paket layanan aktif
    const qPaket = DB("mst_paket_layanan as p")
      .leftJoin("mst_ruangan as r", "p.kode_ruangan", "r.kode_ruangan")
      .where("p.status", "aktif");

    if (branchCode) qPaket.where("p.kode_cabang", branchCode);

    const vaPaket = await qPaket
      .select("p.kode_paket_layanan", "p.nama", "p.harga_paket", "p.masa_berlaku_hari", "p.tanggal_mulai", "p.tanggal_selesai", "p.tipe", "p.kode_ruangan", "p.foto", "r.nama_ruangan as nama_ruangan", "r.is_konsultasi as is_konsultasi")
      .orderBy("p.id", "asc");

    // 5b. Fetch antrean aktif hari ini per ruangan dan hitung sisa beban waktu
    const cfgKonsul = await DB("config").where("kode", "durasi_sesi_konsul_menit").first();
    const durasiSesiKonsulMenit = parseInt(cfgKonsul?.keterangan || 10, 10) || 10;

    const cfgBuffer = await DB("config").where("kode", "buffer_waktu_booking_menit").first();
    const bufferBookingMenit = cfgBuffer ? parseInt(cfgBuffer.keterangan || 15, 10) : 15;

    const cfgToleransi = await DB("config").where("kode", "toleransi_keterlambatan_menit").first();
    const toleransiMenit = parseInt(cfgToleransi?.keterangan || "30", 10) || 30;

    const nowTime = new Date();
    const nowTimestamp = nowTime.getTime();
    const nowMinutes = nowTime.getHours() * 60 + nowTime.getMinutes();

    const minRelevantBookingDate = new Date(nowTimestamp - toleransiMenit * 60000);
    const minRelevantBookingTimeStr = minRelevantBookingDate.toTimeString().slice(0, 8); // "HH:mm:ss"

    const qActiveQueues = DB("trx_antrian_layanan")
      .where("created_at", ">=", `${todayStr} 00:00:00`)
      .whereIn("status", ["dipanggil", "menunggu"]);

    if (branchCode) qActiveQueues.where("kode_cabang", branchCode);

    const activeQueuesList = await qActiveQueues.select("id", "kode_antrian_layanan", "kode_ruangan", "status", "dipanggil_at");

    const queueCodes = activeQueuesList.map((q) => q.kode_antrian_layanan);
    let queueDetails = [];
    if (queueCodes.length > 0) {
      queueDetails = await DB("trx_detail_antrian_layanan")
        .whereIn("kode_antrian_layanan", queueCodes)
        .whereIn("jenis_layanan", ["layanan", "paket", "klaim_paket"])
        .where("durasi_menit", ">", 0)
        .select("kode_antrian_layanan", "durasi_menit");
    }

    const queueDurationMap = new Map();
    queueDetails.forEach((d) => {
      const cur = queueDurationMap.get(d.kode_antrian_layanan) || 0;
      const durasi = parseInt(d.durasi_menit, 10);
      if (!isNaN(durasi) && durasi > 0) {
        queueDurationMap.set(d.kode_antrian_layanan, cur + durasi);
      }
    });

    const activeQueuesMap = new Map();
    const roomSisaBebanMap = new Map();

    activeQueuesList.forEach((q) => {
      activeQueuesMap.set(q.kode_ruangan, (activeQueuesMap.get(q.kode_ruangan) || 0) + 1);

      const isKonsulRoom = q.kode_ruangan === kodeRuanganKonsul;
      const bebanAntrean = isKonsulRoom
        ? durasiSesiKonsulMenit
        : (queueDurationMap.get(q.kode_antrian_layanan) || 30);

      let sisa = 0;
      if (q.status === "dipanggil") {
        const dipanggilTime = q.dipanggil_at ? new Date(q.dipanggil_at).getTime() : nowTimestamp;
        const elapsedMin = Math.max(0, Math.floor((nowTimestamp - dipanggilTime) / 60000));
        sisa = Math.max(0, bebanAntrean - elapsedMin);
      } else if (q.status === "menunggu") {
        sisa = bebanAntrean;
      }
      roomSisaBebanMap.set(q.kode_ruangan, (roomSisaBebanMap.get(q.kode_ruangan) || 0) + sisa);
    });

    // 5c. Fetch booking terkonfirmasi hari ini per ruangan yang belum lewat batas toleransi
    const currentTimeStr = nowTime.toTimeString().slice(0, 8);
    const qBookings = DB("trx_booking as b")
      .leftJoin("mst_pasien as p", "b.no_rm", "p.no_rm")
      .leftJoin("mst_jadwal_karyawan as j", "b.kode_jadwal", "j.kode_jadwal")
      .leftJoin("mst_karyawan as k", "j.no_sip", "k.no_sip")
      .where("b.tanggal_booking", todayStr)
      .where("b.status", "dikonfirmasi")
      .where("b.jam_booking", ">=", minRelevantBookingTimeStr);

    if (branchCode) qBookings.where("b.kode_cabang", branchCode);

    const confirmedBookingsToday = await qBookings
      .select(
        "b.kode_booking",
        "b.kode_ruangan as b_kode_ruangan",
        "j.kode_ruangan as j_kode_ruangan",
        "b.jam_booking",
        "b.jenis_layanan",
        "b.kode_layanan",
        "p.nama as nama_pasien",
        "b.no_rm",
        "k.nama as nama_petugas",
        "k.jabatan as jabatan_petugas",
        "j.kode_jadwal",
        "j.jam_mulai",
        "j.jam_selesai",
        "j.no_sip",
        "j.is_penanggung_jawab"
      )
      .orderBy("b.jam_booking", "asc");

    // Ambil detail item booking untuk mendapatkan durasi dan nama layanan
    const bookingCodes = confirmedBookingsToday.map((b) => b.kode_booking);
    const bookingDetailsMap = new Map();
    if (bookingCodes.length > 0) {
      const details = await DB("trx_detail_booking")
        .whereIn("kode_booking", bookingCodes)
        .select("kode_booking", "nama_layanan", "durasi_menit");

      details.forEach((d) => {
        if (!bookingDetailsMap.has(d.kode_booking)) {
          bookingDetailsMap.set(d.kode_booking, {
            total_durasi: 0,
            items: [],
          });
        }
        const bDet = bookingDetailsMap.get(d.kode_booking);
        bDet.total_durasi += parseInt(d.durasi_menit || 30, 10);
        if (d.nama_layanan && !bDet.items.includes(d.nama_layanan)) {
          bDet.items.push(d.nama_layanan);
        }
      });
    }

    const roomBookingsMap = new Map();
    confirmedBookingsToday.forEach((b) => {
      const roomCode = b.b_kode_ruangan || b.j_kode_ruangan;
      if (!roomCode) return;
      if (!roomBookingsMap.has(roomCode)) {
        roomBookingsMap.set(roomCode, {
          total: 0,
          nearestUpcoming: null,
          allBookings: [],
        });
      }
      const entry = roomBookingsMap.get(roomCode);
      entry.total += 1;

      const jamStr = String(b.jam_booking || "").slice(0, 8);
      const bDet = bookingDetailsMap.get(b.kode_booking);
      let durasiMenit = 30;
      let layananSummary = "-";

      if (bDet && bDet.items.length > 0) {
        durasiMenit = bDet.total_durasi;
        layananSummary = bDet.items.join(", ");
      } else {
        const foundL = vaLayanan.find((l) => l.kode_layanan === b.kode_layanan);
        if (foundL) {
          durasiMenit = parseInt(foundL.durasi_menit || 30, 10);
          layananSummary = foundL.nama || "-";
        } else {
          const foundP = vaPaket.find((p) => p.kode_paket_layanan === b.kode_layanan);
          if (foundP) {
            durasiMenit = 60;
            layananSummary = foundP.nama || "-";
          }
        }
      }

      // Ambil petugas pendamping (is_penanggung_jawab = 0) pada sesi dan ruangan yang sama
      const bMulai = b.jam_mulai ? String(b.jam_mulai).slice(0, 5) : null;
      const bSelesai = b.jam_selesai ? String(b.jam_selesai).slice(0, 5) : null;
      const bJamStr = jamStr.slice(0, 5);
      const roomSchedules = roomSchedulesMap.get(roomCode) || [];

      const companions = roomSchedules
        .filter((s) => {
          if (s.kode_jadwal && b.kode_jadwal && s.kode_jadwal === b.kode_jadwal) return false;
          if (s.no_sip && b.no_sip && s.no_sip === b.no_sip) return false;
          const sMulai = s.jam_mulai ? String(s.jam_mulai).slice(0, 5) : "00:00";
          const sSelesai = s.jam_selesai ? String(s.jam_selesai).slice(0, 5) : "23:59";

          if (bMulai && bSelesai) {
            return sMulai === bMulai && sSelesai === bSelesai;
          }
          return bJamStr >= sMulai && bJamStr <= sSelesai;
        })
        .map((s) => ({
          kode_jadwal: s.kode_jadwal,
          no_sip: s.no_sip,
          nama_petugas: s.nama_petugas || "Petugas Medis",
          jabatan_petugas: s.jabatan_petugas || "Terapis / Petugas",
        }));

      const [bH, bM] = jamStr.slice(0, 5).split(":").map(Number);
      const bookingMin = (isNaN(bH) ? 0 : bH) * 60 + (isNaN(bM) ? 0 : bM);
      const expiryMin = bookingMin + toleransiMenit;
      const isPastTolerance = nowMinutes >= expiryMin;
      const isUpcomingOrGrace = !isPastTolerance;

      const bookingItem = {
        kode_booking: b.kode_booking,
        jam_booking: jamStr.slice(0, 5),
        jam_booking_full: jamStr,
        nama_pasien: b.nama_pasien || b.no_rm,
        no_rm: b.no_rm,
        nama_petugas: b.nama_petugas || "-",
        jabatan_petugas: b.jabatan_petugas || "",
        jam_mulai: bMulai,
        jam_selesai: bSelesai,
        durasi_menit: durasiMenit,
        layanan_summary: layananSummary,
        is_upcoming: isUpcomingOrGrace,
        is_in_grace: nowMinutes >= bookingMin && !isPastTolerance,
        petugas_pendamping: companions,
        daftar_petugas_pendamping: companions,
        jumlah_pendamping: companions.length,
      };

      entry.allBookings.push(bookingItem);

      if (isUpcomingOrGrace && !entry.nearestUpcoming) {
        const expH = Math.floor(expiryMin / 60);
        const expM = expiryMin % 60;
        entry.nearestUpcoming = {
          jam_booking: jamStr.slice(0, 5),
          nama_pasien: b.nama_pasien || b.no_rm,
          kode_booking: b.kode_booking,
          is_in_grace: nowMinutes >= bookingMin,
          expiry_time: `${String(expH).padStart(2, "0")}:${String(expM).padStart(2, "0")}`,
        };
      }
    });

    // Helper kalkulasi status kapasitas dini per ruangan
    const calculateCapacityStatus = (bookingInfo, sisaBebanMenit, bufferMenit) => {
      const nearestBkg = bookingInfo?.nearestUpcoming;
      let statusKapasitas = "aman";
      let statusBadge = "Aman";
      let badgeColor = "green";
      let slackMenit = null;
      let keteranganStatus = "Kapasitas longgar (tidak ada booking terdekat)";

      if (nearestBkg && nearestBkg.jam_booking) {
        const [bH, bM] = String(nearestBkg.jam_booking).slice(0, 5).split(":").map(Number);
        const bookingMinutes = (isNaN(bH) ? 0 : bH) * 60 + (isNaN(bM) ? 0 : bM);
        const nowMin = nowTime.getHours() * 60 + nowTime.getMinutes();
        const menitMenujuBooking = bookingMinutes - nowMin;
        slackMenit = menitMenujuBooking - sisaBebanMenit - bufferMenit;

        const pasienName = nearestBkg.nama_pasien ? ` (${nearestBkg.nama_pasien})` : "";
        if (nearestBkg.is_in_grace || menitMenujuBooking <= 0) {
          statusKapasitas = "berisiko";
          statusBadge = "Berisiko Penuh";
          badgeColor = "red";
          keteranganStatus = `Ada booking jam ${nearestBkg.jam_booking}${pasienName} sedang ditunggu kehadirannya (batas toleransi s/d ${nearestBkg.expiry_time || '30 menit'}). Ruangan dikunci untuk booking.`;
        } else if (slackMenit > 60) {
          statusKapasitas = "aman";
          statusBadge = "Aman";
          badgeColor = "green";
          keteranganStatus = `Ada booking jam ${nearestBkg.jam_booking}${pasienName}, sisa waktu aman > 60m (±${slackMenit}m)`;
        } else if (slackMenit >= 15 && slackMenit <= 60) {
          statusKapasitas = "waspada";
          statusBadge = "Waspada";
          badgeColor = "yellow";
          keteranganStatus = `Ada booking jam ${nearestBkg.jam_booking}${pasienName}, sisa waktu aman ±${Math.max(0, slackMenit)} menit`;
        } else {
          statusKapasitas = "berisiko";
          statusBadge = "Berisiko Penuh";
          badgeColor = "red";
          keteranganStatus = `Ada booking jam ${nearestBkg.jam_booking}${pasienName}, sisa waktu aman sangat terbatas (±${Math.max(0, slackMenit)} menit)`;
        }
      }

      return {
        status_kapasitas: statusKapasitas,
        status_badge: statusBadge,
        badge_color: badgeColor,
        slack_menit: slackMenit,
        keterangan_status: keteranganStatus,
      };
    };

    // Map layanan & paket grouped by ruangan (initialized with ALL DB rooms)
    const ruanganMap = new Map();
    vaRuangan.forEach((rng) => {
      const roomSchedules = roomSchedulesMap.get(rng.kode_ruangan) || [];
      const hasPetugas = roomSchedules.length > 0;
      const pjStaff = roomSchedules.find((s) => s.is_penanggung_jawab === 1) || roomSchedules[0];
      const bookingInfo = roomBookingsMap.get(rng.kode_ruangan);
      const antreanCount = activeQueuesMap.get(rng.kode_ruangan) || 0;
      const sisaBebanMenit = roomSisaBebanMap.get(rng.kode_ruangan) || 0;
      const estimasiMulaiDate = new Date(nowTimestamp + sisaBebanMenit * 60000);
      const estimasiMulaiStr = estimasiMulaiDate.toTimeString().slice(0, 5);
      const cap = calculateCapacityStatus(bookingInfo, sisaBebanMenit, bufferBookingMenit);

      ruanganMap.set(rng.kode_ruangan, {
        kode_ruangan: rng.kode_ruangan,
        nama_ruangan: rng.nama_ruangan || rng.kode_ruangan,
        deskripsi: "",
        is_konsultasi: Number(rng.is_konsultasi || 0),
        has_petugas_jaga_today: hasPetugas,
        petugas_jaga_count: roomSchedules.length,
        petugas_pj: pjStaff
          ? {
              nama: pjStaff.nama_petugas,
              jabatan: pjStaff.jabatan_petugas,
              no_sip: pjStaff.no_sip,
              jam_mulai: pjStaff.jam_mulai?.slice(0, 5),
              jam_selesai: pjStaff.jam_selesai?.slice(0, 5),
            }
          : null,
        petugas_jaga_names: roomSchedules.map((s) => s.nama_petugas).filter(Boolean),
        antrean_aktif_count: antreanCount,
        sisa_beban_menit: sisaBebanMenit,
        estimasi_mulai_sekarang: estimasiMulaiStr,
        buffer_booking_menit: bufferBookingMenit,
        jam_booking_terdekat: bookingInfo?.nearestUpcoming?.jam_booking || null,
        nama_pasien_booking_terdekat: bookingInfo?.nearestUpcoming?.nama_pasien || null,
        total_booking_hari_ini: bookingInfo?.total || 0,
        daftar_booking_hari_ini: bookingInfo?.allBookings || [],
        status_kapasitas: cap.status_kapasitas,
        status_badge: cap.status_badge,
        badge_color: cap.badge_color,
        slack_menit: cap.slack_menit,
        keterangan_status: cap.keterangan_status,
        items: [],
      });
    });

    // Fetch active promos for today
    const qPromos = DB("mst_promo as p")
      .join("mst_detail_promo as dp", "p.kode_promo", "dp.kode_promo")
      .where("p.status", "aktif")
      .where("dp.status", "aktif")
      .whereRaw("DATE(p.tanggal_mulai) <= ?", [todayStr])
      .whereRaw("DATE(p.tanggal_selesai) >= ?", [todayStr]);

    if (branchCode) qPromos.where("p.kode_cabang", branchCode);

    const activePromos = await qPromos
      .select(
        "p.kode_promo",
        "p.nama as nama_promo",
        "p.jenis_diskon",
        "p.nilai_diskon",
        "dp.jenis_item",
        "dp.kode_item"
      );

    const promoMap = {};
    activePromos.forEach((pr) => {
      const jenisClean = (pr.jenis_item || "").toLowerCase();
      const normJenis = jenisClean.includes("layanan")
        ? jenisClean.includes("paket") ? "paket" : "layanan"
        : jenisClean.includes("produk") ? jenisClean.includes("paket") ? "paket" : "produk" : jenisClean;

      const keys = [`${normJenis}_${pr.kode_item}`, `${jenisClean}_${pr.kode_item}`];
      keys.forEach((key) => {
        if (!promoMap[key]) {
          promoMap[key] = pr;
        } else {
          const curVal = parseFloat(promoMap[key].nilai_diskon || 0);
          const newVal = parseFloat(pr.nilai_diskon || 0);
          if (newVal > curVal) {
            promoMap[key] = pr;
          }
        }
      });
    });

    const applyPromo = (item) => {
      const jenisClean = (item.jenis || "").toLowerCase();
      const normJenis = jenisClean.includes("layanan")
        ? jenisClean.includes("paket") ? "paket" : "layanan"
        : jenisClean.includes("produk") ? jenisClean.includes("paket") ? "paket" : "produk" : jenisClean;

      const key1 = `${normJenis}_${item.kode_layanan}`;
      const key2 = `${jenisClean}_${item.kode_layanan}`;
      const promo = promoMap[key1] || promoMap[key2];

      if (promo) {
        const diskonNilai = parseFloat(promo.nilai_diskon || 0);
        let hargaDiskon = item.harga;
        if (promo.jenis_diskon === "persen") {
          hargaDiskon = Math.max(0, item.harga - (item.harga * diskonNilai) / 100);
        } else {
          hargaDiskon = Math.max(0, item.harga - diskonNilai);
        }

        return {
          ...item,
          is_promo: true,
          kode_promo: promo.kode_promo,
          nama_promo: promo.nama_promo,
          jenis_diskon: promo.jenis_diskon,
          nilai_diskon: diskonNilai,
          harga_asal: item.harga,
          harga: hargaDiskon,
        };
      }

      return {
        ...item,
        is_promo: false,
        harga_asal: item.harga,
      };
    };

    vaLayanan.forEach((lay) => {
      const kodeRuang = lay.kode_ruangan || "LAINNYA";
      let rngObj = ruanganMap.get(kodeRuang);

      // Tentukan validasi ketersediaan petugas hari ini:
      // Jika layanan wajib konsultasi (wajib_konsultasi = 'wajib' atau tipe = 'MEDICAL TREATMENT'),
      // tujuan antrean pertama adalah Ruang Konsultasi, sehingga yang divalidasi adalah Ruang Konsultasi!
      const isWajibKonsul =
        (lay.wajib_konsultasi || "").toString().trim().toLowerCase() === "wajib" ||
        (lay.tipe || "").toString().trim().toUpperCase() === "MEDICAL TREATMENT";

      const targetRuanganCek = isWajibKonsul
        ? (lay.kode_ruangan_konsultasi || kodeRuanganKonsul)
        : (lay.kode_ruangan || "");
      const namaRuanganCek = isWajibKonsul
        ? namaRuanganKonsul
        : (lay.nama_ruangan || lay.kode_ruangan || "Ruang Treatment");

      const targetSchedules = roomSchedulesMap.get(targetRuanganCek) || [];
      const isPetugasAvailable = targetSchedules.length > 0;
      const targetPj = targetSchedules.find((s) => s.is_penanggung_jawab === 1) || targetSchedules[0];

      let alasanTidakTersedia = null;
      if (!isPetugasAvailable) {
        if (isWajibKonsul) {
          alasanTidakTersedia = `Tidak ada dokter/petugas jaga di ${namaRuanganCek} hari ini (${todayDay})`;
        } else {
          alasanTidakTersedia = `Tidak ada petugas jaga di ${namaRuanganCek} hari ini (${todayDay})`;
        }
      }

      const bookingInfo = roomBookingsMap.get(kodeRuang);
      const sisaBebanMenit = roomSisaBebanMap.get(kodeRuang) || 0;
      const cap = calculateCapacityStatus(bookingInfo, sisaBebanMenit, bufferBookingMenit);

      const rawItem = {
        jenis: "layanan",
        kode_layanan: lay.kode_layanan,
        kode_kategori: lay.kode_kategori_layanan,
        nama_kategori: lay.nama_kategori || "",
        nama: lay.nama,
        foto: lay.foto
          ? (lay.foto.startsWith("http") ? lay.foto : `${assetsBase}/uploads/layanan/${lay.foto}`)
          : null,
        harga: parseFloat(lay.harga || 0),
        durasi_menit: parseInt(lay.durasi_menit || 30, 10),
        tipe: (lay.tipe || "BEAUTY TREATMENT").toString().trim().toUpperCase(),
        kode_ruangan: lay.kode_ruangan || "",
        nama_ruangan: lay.nama_ruangan || lay.kode_ruangan || "Ruang Treatment",
        wajib_konsultasi: lay.wajib_konsultasi || "tidak",
        kode_ruangan_konsultasi: lay.kode_ruangan_konsultasi || "",
        is_konsultasi: Number(lay.is_konsultasi || 0),
        // Validasi petugas jaga hari ini
        is_petugas_available: isPetugasAvailable,
        alasan_tidak_tersedia: alasanTidakTersedia,
        ruangan_cek: targetRuanganCek,
        nama_ruangan_cek: namaRuanganCek,
        petugas_jaga_count: targetSchedules.length,
        petugas_pj_nama: targetPj?.nama_petugas || null,
        status_kapasitas: cap.status_kapasitas,
        status_badge: cap.status_badge,
        keterangan_status: cap.keterangan_status,
        jam_booking_terdekat: bookingInfo?.nearestUpcoming?.jam_booking || null,
        nama_pasien_booking_terdekat: bookingInfo?.nearestUpcoming?.nama_pasien || null,
      };

      const itemData = applyPromo(rawItem);

      if (!rngObj) {
        rngObj = {
          kode_ruangan: kodeRuang,
          nama_ruangan: lay.nama_ruangan || "Ruangan Lainnya",
          deskripsi: "",
          is_konsultasi: Number(lay.is_konsultasi || 0),
          has_petugas_jaga_today: isPetugasAvailable,
          petugas_jaga_count: targetSchedules.length,
          petugas_pj: null,
          petugas_jaga_names: [],
          antrean_aktif_count: activeQueuesMap.get(kodeRuang) || 0,
          sisa_beban_menit: sisaBebanMenit,
          buffer_booking_menit: bufferBookingMenit,
          jam_booking_terdekat: bookingInfo?.nearestUpcoming?.jam_booking || null,
          nama_pasien_booking_terdekat: bookingInfo?.nearestUpcoming?.nama_pasien || null,
          total_booking_hari_ini: bookingInfo?.total || 0,
          daftar_booking_hari_ini: bookingInfo?.allBookings || [],
          status_kapasitas: cap.status_kapasitas,
          status_badge: cap.status_badge,
          badge_color: cap.badge_color,
          slack_menit: cap.slack_menit,
          keterangan_status: cap.keterangan_status,
          items: [],
        };
        ruanganMap.set(kodeRuang, rngObj);
      }
      rngObj.items.push(itemData);
    });

    // Format paket items & merge into ruanganMap
    const paketItems = [];
    for (const pkt of vaPaket) {
      const detailSesi = await DB("mst_detail_paket_layanan")
        .where("kode_paket_layanan", pkt.kode_paket_layanan)
        .sum("jumlah_sesi as total_sesi")
        .first();
      const totalSesi = parseInt(detailSesi?.total_sesi || 0, 10) || 1;

      // Pengecekan petugas untuk paket: jika tipe MEDICAL TREATMENT -> cek Ruang Konsultasi
      const isWajibKonsul = (pkt.tipe || "").toString().trim().toUpperCase() === "MEDICAL TREATMENT";
      const targetRuanganCek = isWajibKonsul ? kodeRuanganKonsul : (pkt.kode_ruangan || "");
      const namaRuanganCek = isWajibKonsul ? namaRuanganKonsul : (pkt.nama_ruangan || pkt.kode_ruangan || "Ruang Treatment");

      const targetSchedules = roomSchedulesMap.get(targetRuanganCek) || [];
      const isPetugasAvailable = targetSchedules.length > 0;
      const targetPj = targetSchedules.find((s) => s.is_penanggung_jawab === 1) || targetSchedules[0];

      let alasanTidakTersedia = null;
      if (!isPetugasAvailable) {
        if (isWajibKonsul) {
          alasanTidakTersedia = `Tidak ada dokter/petugas jaga di ${namaRuanganCek} hari ini (${todayDay})`;
        } else {
          alasanTidakTersedia = `Tidak ada petugas jaga di ${namaRuanganCek} hari ini (${todayDay})`;
        }
      }

      const kodeRuangPkt = pkt.kode_ruangan || "LAINNYA";
      const bookingInfoPkt = roomBookingsMap.get(kodeRuangPkt);
      const sisaBebanMenitPkt = roomSisaBebanMap.get(kodeRuangPkt) || 0;
      const capPkt = calculateCapacityStatus(bookingInfoPkt, sisaBebanMenitPkt, bufferBookingMenit);

      const rawItem = {
        jenis: "paket",
        kode_layanan: pkt.kode_paket_layanan,
        kode_kategori: "PAKET",
        nama_kategori: "Paket Layanan",
        nama: pkt.nama,
        foto: pkt.foto
          ? (pkt.foto.startsWith("http") ? pkt.foto : `${assetsBase}/uploads/paket_layanan/${pkt.foto}`)
          : null,
        harga: parseFloat(pkt.harga_paket || 0),
        durasi_menit: 60, // default estimasi durasi paket
        masa_berlaku_hari: pkt.masa_berlaku_hari,
        total_sesi: totalSesi,
        tipe: (pkt.tipe || "BEAUTY TREATMENT").toString().trim().toUpperCase(),
        kode_ruangan: pkt.kode_ruangan || "",
        nama_ruangan: pkt.nama_ruangan || pkt.kode_ruangan || "Ruang Treatment",
        is_konsultasi: Number(pkt.is_konsultasi || 0),
        // Validasi petugas jaga hari ini
        is_petugas_available: isPetugasAvailable,
        alasan_tidak_tersedia: alasanTidakTersedia,
        ruangan_cek: targetRuanganCek,
        nama_ruangan_cek: namaRuanganCek,
        petugas_jaga_count: targetSchedules.length,
        petugas_pj_nama: targetPj?.nama_petugas || null,
        status_kapasitas: capPkt.status_kapasitas,
        status_badge: capPkt.status_badge,
        keterangan_status: capPkt.keterangan_status,
        jam_booking_terdekat: bookingInfoPkt?.nearestUpcoming?.jam_booking || null,
        nama_pasien_booking_terdekat: bookingInfoPkt?.nearestUpcoming?.nama_pasien || null,
      };

      const itemData = applyPromo(rawItem);

      const kodeRuang = pkt.kode_ruangan || "LAINNYA";
      let rngObj = ruanganMap.get(kodeRuang);
      if (!rngObj) {
        const bookingInfo = roomBookingsMap.get(kodeRuang);
        const sisaBebanMenit = roomSisaBebanMap.get(kodeRuang) || 0;
        const cap = calculateCapacityStatus(bookingInfo, sisaBebanMenit, bufferBookingMenit);
        rngObj = {
          kode_ruangan: kodeRuang,
          nama_ruangan: pkt.nama_ruangan || "Ruangan Lainnya",
          deskripsi: "",
          is_konsultasi: Number(pkt.is_konsultasi || 0),
          has_petugas_jaga_today: isPetugasAvailable,
          petugas_jaga_count: targetSchedules.length,
          petugas_pj: null,
          petugas_jaga_names: [],
          antrean_aktif_count: activeQueuesMap.get(kodeRuang) || 0,
          sisa_beban_menit: sisaBebanMenit,
          buffer_booking_menit: bufferBookingMenit,
          jam_booking_terdekat: bookingInfo?.nearestUpcoming?.jam_booking || null,
          nama_pasien_booking_terdekat: bookingInfo?.nearestUpcoming?.nama_pasien || null,
          total_booking_hari_ini: bookingInfo?.total || 0,
          daftar_booking_hari_ini: bookingInfo?.allBookings || [],
          status_kapasitas: cap.status_kapasitas,
          status_badge: cap.status_badge,
          badge_color: cap.badge_color,
          slack_menit: cap.slack_menit,
          keterangan_status: cap.keterangan_status,
          items: [],
        };
        ruanganMap.set(kodeRuang, rngObj);
      }
      rngObj.items.push(itemData);
      paketItems.push(itemData);
    }

    // Output all ruangan data from database (all rooms)
    const resultRuangan = Array.from(ruanganMap.values());
    const ruanganDenganPetugasCount = resultRuangan.filter((r) => r.has_petugas_jaga_today).length;

    return res.status(200).json({
      status: status.SUKSES,
      message: "Data pilihan layanan dan paket ditemukan",
      datetime: formatDateSystem(),
      data: {
        today_info: {
          tanggal: todayStr,
          hari: todayDay,
          total_ruangan_aktif: vaRuangan.length,
          ruangan_dengan_petugas_count: ruanganDenganPetugasCount,
          has_petugas_konsul_today: hasPetugasKonsulToday,
        },
        ruang_konsultasi: {
          kode_ruangan: kodeRuanganKonsul,
          nama_ruangan: namaRuanganKonsul,
        },
        semua_ruangan: vaRuangan,
        ruangan_layanan: resultRuangan,
        kategori_layanan: resultRuangan,
        paket_layanan: paketItems,
      },
    });
  } catch (error) {
    const oResult = {
      status: status.BAD_REQUEST,
      message: "Sistem sedang maintenance harap tunggu sebentar",
      datetime: formatDateSystem(),
    };

    Logging(error, {
      file: "/master/pendaftaran_pasien/pendaftaran_pasien_layanan_options.js",
      func: "get_options",
      request: oPayload,
      response: oResult,
      user: username,
    });

    return res.status(500).json(oResult);
  }
};

router.get("/", handleGetOptions);
router.post("/", handleGetOptions);

export default router;
