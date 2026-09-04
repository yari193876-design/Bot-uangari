import express from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

interface StoredTransaction {
  id: string;
  type: 'pengeluaran' | 'pemasukan';
  amount: number;
  description: string;
  category: string;
  timestamp: string; // ISO string
  rawMessage?: string;
}

// In-memory data store with file persistence and auto-backup
const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "transactions.json");
const BACKUP_FILE = path.join(DATA_DIR, "transactions.bak.json");

function loadTransactions(): StoredTransaction[] {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, "utf-8");
      if (content.trim()) {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          // Keep a backup of valid data
          try {
            fs.copyFileSync(DATA_FILE, BACKUP_FILE);
          } catch (_) {}
          return parsed;
        }
      }
    }
    // If primary file was missing or empty, check backup
    if (fs.existsSync(BACKUP_FILE)) {
      const bakContent = fs.readFileSync(BACKUP_FILE, "utf-8");
      if (bakContent.trim()) {
        const parsedBak = JSON.parse(bakContent);
        if (Array.isArray(parsedBak)) {
          console.log("[Data] Memulihkan data transaksi dari backup...");
          try {
            fs.copyFileSync(BACKUP_FILE, DATA_FILE);
          } catch (_) {}
          return parsedBak;
        }
      }
    }
  } catch (err) {
    console.error("Gagal membaca file transaksi:", err);
    // Check backup before failing to empty list
    try {
      if (fs.existsSync(BACKUP_FILE)) {
        const bakContent = fs.readFileSync(BACKUP_FILE, "utf-8");
        const parsedBak = JSON.parse(bakContent);
        if (Array.isArray(parsedBak)) {
          return parsedBak;
        }
      }
    } catch (_) {}
  }

  // Only initialize empty list if file truly doesn't exist
  const emptyList: StoredTransaction[] = [];
  if (!fs.existsSync(DATA_FILE)) {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(emptyList, null, 2), "utf-8");
    } catch (err) {
      console.error("Gagal menulis inisialisasi transaksi kosong:", err);
    }
  }
  return emptyList;
}

let transactions: StoredTransaction[] = loadTransactions();

function saveTransactions() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tempFile = DATA_FILE + ".tmp";
    const content = JSON.stringify(transactions, null, 2);
    fs.writeFileSync(tempFile, content, "utf-8");
    
    // Create backup of existing file before overwrite
    if (fs.existsSync(DATA_FILE)) {
      try {
        fs.copyFileSync(DATA_FILE, BACKUP_FILE);
      } catch (_) {}
    }
    // Atomic rename
    fs.renameSync(tempFile, DATA_FILE);
  } catch (err) {
    console.error("Gagal menyimpan transaksi (atomic):", err);
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(transactions, null, 2), "utf-8");
    } catch (writeErr) {
      console.error("Gagal menyimpan fallback transaksi:", writeErr);
    }
  }
}

// Rupiah formatter
function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// Indonesian Western Time (WIB: UTC+7) helper
function toWibDate(date: Date): Date {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000);
}

// Indonesian date formatter with exact WIB timezone
function formatIndoDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  const wib = toWibDate(date);
  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const months = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
  ];
  const dayName = days[wib.getUTCDay()];
  const day = String(wib.getUTCDate()).padStart(2, "0");
  const monthName = months[wib.getUTCMonth()];
  const year = wib.getUTCFullYear();
  const hours = String(wib.getUTCHours()).padStart(2, "0");
  const mins = String(wib.getUTCMinutes()).padStart(2, "0");

  return `${dayName}, ${day} ${monthName} ${year} • ${hours}:${mins} WIB`;
}

// Check if two timestamps fall on the same calendar day in Indonesia (WIB)
function isSameDay(d1: Date, d2: Date): boolean {
  const wib1 = toWibDate(d1);
  const wib2 = toWibDate(d2);
  return (
    wib1.getUTCFullYear() === wib2.getUTCFullYear() &&
    wib1.getUTCMonth() === wib2.getUTCMonth() &&
    wib1.getUTCDate() === wib2.getUTCDate()
  );
}

// Calculate summary with seamless frontend bindings
function getFinancialSummary() {
  const now = new Date();
  let totalPemasukanHariIni = 0;
  let totalPengeluaranHariIni = 0;
  let totalPemasukanSemua = 0;
  let totalPengeluaranSemua = 0;
  let countHariIni = 0;

  for (const t of transactions) {
    const tDate = new Date(t.timestamp);
    if (isSameDay(tDate, now)) {
      countHariIni++;
      if (t.type === "pemasukan") {
        totalPemasukanHariIni += t.amount;
      } else {
        totalPengeluaranHariIni += t.amount;
      }
    }

    if (t.type === "pemasukan") {
      totalPemasukanSemua += t.amount;
    } else {
      totalPengeluaranSemua += t.amount;
    }
  }

  const saldoHariIni = totalPemasukanHariIni - totalPengeluaranHariIni;
  const saldoKeseluruhan = totalPemasukanSemua - totalPengeluaranSemua;

  return {
    // Aliases for frontend Bento cards
    totalPemasukan: totalPemasukanHariIni,
    totalPengeluaran: totalPengeluaranHariIni,
    transactionCount: countHariIni,
    // Detailed keys
    totalPemasukanHariIni,
    totalPengeluaranHariIni,
    saldoHariIni,
    totalPemasukanSemua,
    totalPengeluaranSemua,
    saldoKeseluruhan,
    countHariIni,
    totalTransactions: transactions.length,
  };
}

// Gemini AI client initialization
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Heuristic / Regex parser for fast, accurate parsing of standard Indonesian formats
function parseIndonesianHeuristic(text: string): {
  isTransaction: boolean;
  isRekap: boolean;
  isGreeting: boolean;
  type?: 'pengeluaran' | 'pemasukan';
  amount?: number;
  description?: string;
  category?: string;
} | null {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  // Check REKAP or saldo questions
  if (
    lower === "rekap" ||
    lower === "/rekap" ||
    lower.includes("rekap") ||
    lower.includes("cek saldo") ||
    lower.includes("sisa saldo") ||
    lower.includes("saldo hari ini") ||
    lower.includes("total pengeluaran hari ini") ||
    lower.includes("sisa uang") ||
    lower.includes("rekap keuangan")
  ) {
    return { isTransaction: false, isRekap: true, isGreeting: false };
  }

  // Check greetings / help
  if (
    lower === "halo" ||
    lower === "hai" ||
    lower === "hi" ||
    lower === "assalamualaikum" ||
    lower === "/start" ||
    lower === "/help" ||
    lower === "bantuan" ||
    lower === "bisa apa aja" ||
    lower === "menu"
  ) {
    return { isTransaction: false, isRekap: false, isGreeting: true };
  }

  // Regex pattern 1: Short format "K 20000 makan", "M 150000 gaji", "P 50000 bonus"
  // K / OUT / - = Pengeluaran
  // M / MASUK / IN / + = Pemasukan
  const shortPattern = /^(K|M|MASUK|KELUAR|IN|OUT|[+-])\s*([0-9.,]+[kKmMbB]?|[0-9]+)\s*(.*)$/i;
  const shortMatch = trimmed.match(shortPattern);
  if (shortMatch) {
    const code = shortMatch[1].toUpperCase();
    const rawAmt = shortMatch[2];
    const desc = shortMatch[3]?.trim() || (code.startsWith("M") || code === "+" ? "Pemasukan" : "Pengeluaran");
    const amount = parseRupiahNumber(rawAmt);

    if (amount > 0) {
      const type: 'pengeluaran' | 'pemasukan' =
        code === "M" || code === "MASUK" || code === "IN" || code === "+" ? "pemasukan" : "pengeluaran";
      return {
        isTransaction: true,
        isRekap: false,
        isGreeting: false,
        type,
        amount,
        description: cleanDescription(desc),
        category: guessCategory(desc, type),
      };
    }
  }

  // Regex pattern 2: Natural casual phrases:
  // "habis beli makan 20rb"
  // "beli bensin 35k"
  // "bayar tagihan listrik 150.000"
  // "dapat transferan 500rb"
  // "jual hp second 1.2jt"
  const amountRegex = /(\d+(?:[.,]\d+)?)\s*(rb|ribu|k|jt|juta|k|m)?\b/i;
  const hasAmount = amountRegex.test(trimmed);

  if (hasAmount) {
    // Check if expense or income
    const incomeKeywords = ["dapat", "dapet", "gaji", "bonus", "transferan", "jual", "penjualan", "laba", "untung", "terima", "kembalian", "hadiah", "thr", "omset", "pemasukan", "masuk"];
    const expenseKeywords = ["beli", "habis", "bayar", "keluar", "makan", "minum", "jajan", "ongkos", "bensin", "parkir", "topup", "top up", "pulsa", "kuota", "belanja", "ngopi", "langganan", "sewa", "tagihan"];

    let isIncome = incomeKeywords.some((k) => lower.includes(k));
    let isExpense = expenseKeywords.some((k) => lower.includes(k));

    if (isIncome && !isExpense) {
      const parsedAmount = extractAmountFromText(trimmed);
      if (parsedAmount > 0) {
        const desc = extractDescriptionFromText(trimmed, incomeKeywords);
        return {
          isTransaction: true,
          isRekap: false,
          isGreeting: false,
          type: "pemasukan",
          amount: parsedAmount,
          description: desc,
          category: guessCategory(desc, "pemasukan"),
        };
      }
    } else if (isExpense || (!isIncome && !isExpense)) {
      // Default to expense if someone says "kopi 25rb" or "nasi padang 20000"
      const parsedAmount = extractAmountFromText(trimmed);
      if (parsedAmount > 0) {
        const desc = extractDescriptionFromText(trimmed, expenseKeywords);
        return {
          isTransaction: true,
          isRekap: false,
          isGreeting: false,
          type: "pengeluaran",
          amount: parsedAmount,
          description: desc || "Pengeluaran",
          category: guessCategory(desc, "pengeluaran"),
        };
      }
    }
  }

  return null;
}

// Convert "20rb", "20k", "2.5jt", "50000", "50.000" into numeric value
function parseRupiahNumber(str: string): number {
  if (!str) return 0;
  const clean = str.trim().toLowerCase();
  
  if (clean.includes("jt") || clean.includes("juta")) {
    const numPart = parseFloat(clean.replace(/[^\d.,]/g, "").replace(",", "."));
    return Math.round(numPart * 1000000);
  }
  if (clean.includes("rb") || clean.includes("ribu") || clean.endsWith("k")) {
    const numPart = parseFloat(clean.replace(/[^\d.,]/g, "").replace(",", "."));
    return Math.round(numPart * 1000);
  }
  // Standard digits with dots or commas like "50.000" or "50000"
  const digitsOnly = clean.replace(/[^\d]/g, "");
  return parseInt(digitsOnly, 10) || 0;
}

function extractAmountFromText(text: string): number {
  // Look for patterns like: "Rp 20.000", "20rb", "20k", "1.5jt", "20000", "20 ribu"
  const match = text.match(/(?:rp\.?\s*)?(\d+(?:[.,]\d+)?)\s*(rb|ribu|k|jt|juta)?\b/i);
  if (match) {
    const full = (match[1] + (match[2] || "")).trim();
    return parseRupiahNumber(full);
  }
  return 0;
}

function extractDescriptionFromText(text: string, _keywords: string[]): string {
  // Remove the amount portion
  let cleaned = text.replace(/(?:rp\.?\s*)?(\d+(?:[.,]\d+)?)\s*(rb|ribu|k|jt|juta)?\b/gi, "").trim();
  // Remove common filler words
  cleaned = cleaned.replace(/^(habis|udah|tadi|barusan|untuk|buat|ke|di)\s+/gi, "").trim();
  // Capitalize first letter
  if (!cleaned) return "Transaksi";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function cleanDescription(desc: string): string {
  if (!desc) return "Transaksi";
  return desc.charAt(0).toUpperCase() + desc.slice(1);
}

function guessCategory(desc: string, type: 'pengeluaran' | 'pemasukan'): string {
  const lower = desc.toLowerCase();
  if (type === "pemasukan") {
    if (lower.includes("gaji") || lower.includes("salary")) return "Gaji & Upah";
    if (lower.includes("bonus") || lower.includes("thr") || lower.includes("hadiah")) return "Bonus & Hadiah";
    if (lower.includes("jual") || lower.includes("omset") || lower.includes("laba")) return "Penjualan & Bisnis";
    if (lower.includes("freelance") || lower.includes("proyek") || lower.includes("side")) return "Pekerjaan Sampingan";
    if (lower.includes("investasi") || lower.includes("dividen")) return "Investasi";
    return "Pendapatan Lainnya";
  }

  // Pengeluaran
  if (lower.includes("makan") || lower.includes("minum") || lower.includes("kopi") || lower.includes("jajan") || lower.includes("sarapan") || lower.includes("siang") || lower.includes("resto") || lower.includes("cafe")) {
    return "Makanan & Minuman";
  }
  if (lower.includes("bensin") || lower.includes("parkir") || lower.includes("tol") || lower.includes("grab") || lower.includes("gojek") || lower.includes("angkot") || lower.includes("ojek")) {
    return "Transportasi";
  }
  if (lower.includes("listrik") || lower.includes("air") || lower.includes("wifi") || lower.includes("internet") || lower.includes("pulsa") || lower.includes("kuota") || lower.includes("tagihan")) {
    return "Tagihan & Utilitas";
  }
  if (lower.includes("baju") || lower.includes("sepatu") || lower.includes("shopee") || lower.includes("tokopedia") || lower.includes("belanja") || lower.includes("supermarket") || lower.includes("indomaret") || lower.includes("alfamart")) {
    return "Belanja";
  }
  if (lower.includes("obat") || lower.includes("dokter") || lower.includes("rs") || lower.includes("vitamin") || lower.includes("klinik")) {
    return "Kesehatan";
  }
  if (lower.includes("bioskop") || lower.includes("game") || lower.includes("steam") || lower.includes("netflix") || lower.includes("spotify") || lower.includes("nonton")) {
    return "Hiburan";
  }
  return "Kebutuhan Harian";
}

// Construct polite, friendly Indonesian Telegram Bot response
function formatTransactionReply(t: StoredTransaction, summary: ReturnType<typeof getFinancialSummary>): string {
  const isPengeluaran = t.type === "pengeluaran";
  const emojiType = isPengeluaran ? "🔴" : "🟢";
  const titleType = isPengeluaran ? "Pengeluaran" : "Pemasukan";
  const greeting = isPengeluaran
    ? "Siap, Kak! Transaksi berhasil dicatat ke pembukuan ya. 📋"
    : "Alhamdulillah, mantap Kak! Pemasukan baru berhasil dicatat. 🎉";

  return `${greeting}

${emojiType} *Tipe:* ${titleType}
💰 *Nominal:* ${formatRupiah(t.amount)}
📝 *Keterangan:* ${t.description}
🏷️ *Kategori:* ${t.category}
📅 *Waktu:* ${formatIndoDateTime(t.timestamp)}
━━━━━━━━━━━━━━━━━━━━
📊 *Saldo Hari Ini:* ${formatRupiah(summary.saldoHariIni)}
🏦 *Saldo Total:* ${formatRupiah(summary.saldoKeseluruhan)}

💡 _Salah catat? Ketik *EDIT TERAKHIR <nominal/ket>* untuk revisi._
_Ketik *REKAP* (harian) atau *REKAP MINGGUAN* untuk laporan._`;
}

function formatRekapReply(summary: ReturnType<typeof getFinancialSummary>, recentToday: StoredTransaction[]): string {
  const todayStr = new Date().toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  let recentList = "";
  if (recentToday.length > 0) {
    recentList = "\n\n📋 *Transaksi Hari Ini:*\n" + recentToday
      .slice(0, 5)
      .map((t) => {
        const icon = t.type === "pengeluaran" ? "🔴" : "🟢";
        const time = new Date(t.timestamp).toLocaleTimeString("id-ID", {
          timeZone: "Asia/Jakarta",
          hour: "2-digit",
          minute: "2-digit",
        });
        return `${icon} ${formatRupiah(t.amount)} — ${t.description} _(${time} WIB)_`;
      })
      .join("\n");
    if (recentToday.length > 5) {
      recentList += `\n_...dan ${recentToday.length - 5} transaksi lainnya._`;
    }
  } else {
    recentList = "\n\n_Belum ada transaksi yang tercatat hari ini._";
  }

  const statusSaldo = summary.saldoHariIni >= 0 ? "🟢 Surplus" : "🔴 Defisit";

  return `📊 *REKAP KEUANGAN HARI INI*
📅 ${todayStr}
━━━━━━━━━━━━━━━━━━━━
🟢 *Total Pemasukan:* ${formatRupiah(summary.totalPemasukanHariIni)}
🔴 *Total Pengeluaran:* ${formatRupiah(summary.totalPengeluaranHariIni)}
━━━━━━━━━━━━━━━━━━━━
💵 *Sisa Saldo Hari Ini:* ${formatRupiah(summary.saldoHariIni)} (${statusSaldo})
🏦 *Total Saldo Kas:* ${formatRupiah(summary.saldoKeseluruhan)}
📌 *Jumlah Transaksi Hari Ini:* ${summary.countHariIni} transaksi${recentList}

💡 _Ketik *REKAP MINGGUAN* untuk melihat akumulasi 7 hari terakhir._`;
}

// Generate weekly recap (last 7 days breakdown)
function formatRekapMingguanReply(summary: ReturnType<typeof getFinancialSummary>): string {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);

  const startStr = sevenDaysAgo.toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
  });
  const endStr = now.toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const weekTrans = transactions
    .filter((t) => new Date(t.timestamp).getTime() >= (now.getTime() - 7 * 24 * 60 * 60 * 1000))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  let totalMasuk = 0;
  let totalKeluar = 0;
  const categoryExpenseMap = new Map<string, number>();

  for (const t of weekTrans) {
    if (t.type === "pemasukan") {
      totalMasuk += t.amount;
    } else {
      totalKeluar += t.amount;
      categoryExpenseMap.set(t.category, (categoryExpenseMap.get(t.category) || 0) + t.amount);
    }
  }

  const saldoMingguan = totalMasuk - totalKeluar;
  const statusMingguan = saldoMingguan >= 0 ? "🟢 Surplus (+)" : "🔴 Defisit (-)";
  const avgKeluarPerHari = Math.round(totalKeluar / 7);

  // Categories breakdown
  let catSection = "";
  if (categoryExpenseMap.size > 0 && totalKeluar > 0) {
    const sortedCats = Array.from(categoryExpenseMap.entries()).sort((a, b) => b[1] - a[1]);
    catSection = "\n\n📊 *Pengeluaran per Kategori (7 Hari):*\n" +
      sortedCats
        .map(([cat, amt]) => {
          const pct = Math.round((amt / totalKeluar) * 100);
          return `• ${cat}: ${formatRupiah(amt)} _(${pct}%)_`;
        })
        .join("\n");
  }

  // Recent transactions in week
  let recentSection = "";
  if (weekTrans.length > 0) {
    recentSection = "\n\n📋 *Transaksi Terbaru Minggu Ini:*\n" +
      weekTrans
        .slice(0, 5)
        .map((t) => {
          const icon = t.type === "pengeluaran" ? "🔴" : "🟢";
          const dateObj = new Date(t.timestamp);
          const dayName = dateObj.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", weekday: "short" });
          const dateDay = dateObj.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit" });
          return `${icon} ${dayName}, ${dateDay}: ${formatRupiah(t.amount)} — ${t.description}`;
        })
        .join("\n");

    if (weekTrans.length > 5) {
      recentSection += `\n_...dan ${weekTrans.length - 5} transaksi lainnya._`;
    }
  } else {
    recentSection = "\n\n_Belum ada transaksi yang tercatat dalam 7 hari terakhir._";
  }

  return `📈 *REKAP KEUANGAN MINGGUAN (7 HARI TERAKHIR)*
📅 *Periode:* ${startStr} – ${endStr}
━━━━━━━━━━━━━━━━━━━━
🟢 *Total Pemasukan 7 Hari:* ${formatRupiah(totalMasuk)}
🔴 *Total Pengeluaran 7 Hari:* ${formatRupiah(totalKeluar)}
━━━━━━━━━━━━━━━━━━━━
💵 *Arus Kas Mingguan:* ${formatRupiah(saldoMingguan)} (${statusMingguan})
📉 *Rata-rata Pengeluaran:* ${formatRupiah(avgKeluarPerHari)} / hari
📌 *Aktivitas Transaksi:* ${weekTrans.length} transaksi
🏦 *Total Saldo Kas Saat Ini:* ${formatRupiah(summary.saldoKeseluruhan)}${catSection}${recentSection}

💡 _Ketik *REKAP* untuk rekap hari ini, atau *EDIT TERAKHIR* untuk merevisi transaksi._`;
}

// Handle chat edit command directly from Telegram
function handleChatEditCommand(userMessage: string): {
  reply: string;
  transaction?: StoredTransaction;
  isEdit?: boolean;
} {
  if (transactions.length === 0) {
    return {
      reply: `✏️ *Edit Transaksi via Chat*
━━━━━━━━━━━━━━━━━━━━
Belum ada transaksi yang tersimpan di database Kak.
Silakan catat transaksi baru terlebih dahulu (contoh: _"K 25000 makan siang"_ atau _"beli bensin 35k"_). 😊`,
      isEdit: true,
    };
  }

  const trimmed = userMessage.trim();
  const lower = trimmed.toLowerCase();

  // If user just typed "edit", "/edit", "ralat", "cara edit"
  const isJustEditCommand =
    lower === "edit" ||
    lower === "/edit" ||
    lower === "ralat" ||
    lower === "/ralat" ||
    lower === "ganti" ||
    lower === "ubah" ||
    lower === "cara edit" ||
    lower === "edit transaksi";

  const latest = transactions[0];

  if (isJustEditCommand) {
    const icon = latest.type === "pengeluaran" ? "🔴" : "🟢";
    const typeName = latest.type === "pengeluaran" ? "Pengeluaran" : "Pemasukan";
    return {
      reply: `✏️ *PANDUAN EDIT TRANSAKSI VIA CHAT*
━━━━━━━━━━━━━━━━━━━━
📌 *Transaksi Terakhir Saat Ini:*
[ID: \`${latest.id}\`]
${icon} *Tipe:* ${typeName}
💰 *Nominal:* ${formatRupiah(latest.amount)}
📝 *Keterangan:* ${latest.description}
🏷️ *Kategori:* ${latest.category}
📅 *Waktu:* ${formatIndoDateTime(latest.timestamp)}
━━━━━━━━━━━━━━━━━━━━
💡 *Contoh Perintah Edit via Chat:*

1️⃣ *Ubah Nominal & Keterangan (Transaksi Terakhir):*
   ↳ Ketik: \`EDIT TERAKHIR 30rb rokok dan korek\`
   ↳ Atau: \`RALAT 35000 nasi padang rendang\`

2️⃣ *Hanya Ubah Nominal:*
   ↳ Ketik: \`EDIT TERAKHIR 25000\` atau \`EDIT TERAKHIR 30rb\`

3️⃣ *Hanya Ubah Keterangan:*
   ↳ Ketik: \`EDIT TERAKHIR KET rokok surya 16\`

4️⃣ *Ubah Tipe Transaksi (Pemasukan / Pengeluaran):*
   ↳ Ketik: \`EDIT TERAKHIR M 50000 bonus jualan\`
   ↳ Atau: \`EDIT TERAKHIR K 30000 bensin pertamax\`

5️⃣ *Edit dengan ID Transaksi Tertentu:*
   ↳ Ketik: \`EDIT ${latest.id} 30rb rokok\`

Silakan langsung ketik perintah revisi yang kamu inginkan ya Kak! 👍`,
      isEdit: true,
    };
  }

  // Find target transaction
  let targetTx: StoredTransaction | undefined;
  let remainingText = trimmed;

  // Check if specific ID is mentioned: tx-...
  const idMatch = remainingText.match(/\b(tx-\d+-[a-z0-9]+)\b/i);
  if (idMatch) {
    const foundId = idMatch[1];
    targetTx = transactions.find((t) => t.id.toLowerCase() === foundId.toLowerCase());
    remainingText = remainingText.replace(idMatch[0], "").trim();
  }

  // Check if index #1, #2 or 1, 2 is mentioned right after edit
  if (!targetTx) {
    const indexMatch = remainingText.match(/^(?:edit|ralat|ganti|ubah)\s+#?(\d+)\b/i);
    if (indexMatch) {
      const idx = parseInt(indexMatch[1], 10) - 1;
      if (idx >= 0 && idx < transactions.length) {
        targetTx = transactions[idx];
        remainingText = remainingText.replace(indexMatch[0], "").trim();
      }
    }
  }

  // Default to latest transaction
  if (!targetTx) {
    targetTx = transactions[0];
  }

  // Clean command prefix from remainingText
  remainingText = remainingText
    .replace(/^(?:edit|ralat|ganti|ubah|revisi)\s+(?:terakhir\s+)?/i, "")
    .replace(/^(?:terakhir\s+)/i, "")
    .trim();

  if (!remainingText) {
    return {
      reply: `⚠️ Mohon sertakan data baru yang ingin diubah Kak.
Contoh:
• \`EDIT TERAKHIR 30rb rokok\`
• \`EDIT TERAKHIR 25000\`
• \`EDIT TERAKHIR KET bensin pertamax\``,
      isEdit: true,
    };
  }

  // Store previous values for before/after comparison
  const oldAmount = targetTx.amount;
  const oldDesc = targetTx.description;
  const oldType = targetTx.type;
  const oldCategory = targetTx.category;

  // Check if only changing description: "KET ..." or "KETERANGAN ..."
  const ketMatch = remainingText.match(/^(?:ket|keterangan)\s+(.+)$/i);
  if (ketMatch) {
    const newDesc = ketMatch[1].trim();
    targetTx.description = cleanDescription(newDesc);
    targetTx.category = guessCategory(targetTx.description, targetTx.type);
  } else {
    // Check if new type is explicitly declared: "K ..." or "M ..." or "MASUK ..." or "KELUAR ..."
    const typeMatch = remainingText.match(/^(K|M|MASUK|KELUAR|IN|OUT|[+-])\s+/i);
    if (typeMatch) {
      const code = typeMatch[1].toUpperCase();
      targetTx.type = (code === "M" || code === "MASUK" || code === "IN" || code === "+") ? "pemasukan" : "pengeluaran";
      remainingText = remainingText.slice(typeMatch[0].length).trim();
    }

    // Check if amount is present
    const newAmount = extractAmountFromText(remainingText);
    if (newAmount > 0) {
      targetTx.amount = newAmount;
    }

    // Extract description (excluding amount and keywords)
    const newDesc = extractDescriptionFromText(remainingText, ["edit", "terakhir", "ralat", "ganti", "ubah", "k", "m"]);
    if (newDesc && newDesc.toLowerCase() !== "transaksi" && newDesc.length > 1) {
      targetTx.description = cleanDescription(newDesc);
    }

    // Update category
    targetTx.category = guessCategory(targetTx.description, targetTx.type);
  }

  // Save changes to JSON file
  saveTransactions();
  const summary = getFinancialSummary();

  const oldIcon = oldType === "pengeluaran" ? "🔴" : "🟢";
  const oldTitle = oldType === "pengeluaran" ? "Pengeluaran" : "Pemasukan";
  const newIcon = targetTx.type === "pengeluaran" ? "🔴" : "🟢";
  const newTitle = targetTx.type === "pengeluaran" ? "Pengeluaran" : "Pemasukan";

  return {
    reply: `✅ *TRANSAKSI BERHASIL DIPERBARUI!*
━━━━━━━━━━━━━━━━━━━━
🔹 *SEBELUMNYA:*
${oldIcon} ${oldTitle} • ${formatRupiah(oldAmount)}
📝 ${oldDesc} _(🏷️ ${oldCategory})_

🔻 *SESUDAH DIUBAH:*
${newIcon} ${newTitle} • ${formatRupiah(targetTx.amount)}
📝 ${targetTx.description} _(🏷️ ${targetTx.category})_
📅 Waktu: ${formatIndoDateTime(targetTx.timestamp)}
━━━━━━━━━━━━━━━━━━━━
📊 *Saldo Hari Ini:* ${formatRupiah(summary.saldoHariIni)}
🏦 *Total Saldo Kas:* ${formatRupiah(summary.saldoKeseluruhan)}

_Perubahan otomatis disinkronkan ke database & Google Sheets._ 👍`,
    transaction: targetTx,
    isEdit: true,
  };
}

function formatGreetingReply(): string {
  return `Halo Kak! 👋 Saya adalah *Asisten Pencatat Keuangan Pribadi* kamu.

Saya siap mencatat setiap pemasukan dan pengeluaran kamu secara instan dan rapi! 🚀

💡 *Perintah & Format Chat:*
• *Format Santai:*
  ↳ _"habis beli makan siang 25rb"_
  ↳ _"beli bensin motor 35k"_
  ↳ _"dapet transferan jualan 150rb"_
• *Format Singkat:*
  ↳ _"K 20000 makan"_ (K = Keluar)
  ↳ _"M 500000 gaji freelance"_ (M = Masuk)
• *✏️ Edit / Ralat Transaksi:*
  ↳ Ketik: \`EDIT TERAKHIR 30rb rokok\`
  ↳ Atau ketik: \`EDIT\` untuk melihat transaksi terakhir & bantuan edit.
• *📊 Rekap Keuangan:*
  ↳ Ketik *_REKAP_* (laporan hari ini)
  ↳ Ketik *_REKAP MINGGUAN_* (laporan akumulasi 7 hari)

Semua data tersimpan otomatis di database dan bisa di-export ke Google Sheets! Silakan langsung ketik transaksimu ya Kak! 🌟`;
}

// Emergency fallback parser when AI models are temporarily unavailable
function emergencyFallbackParser(userMessage: string): {
  type: 'pengeluaran' | 'pemasukan';
  amount: number;
  description: string;
  category: string;
} | null {
  const amt = extractAmountFromText(userMessage);
  if (amt <= 0) return null;

  const lower = userMessage.toLowerCase();
  const incomeKeywords = ["dapat", "dapet", "gaji", "bonus", "transferan", "jual", "penjualan", "laba", "untung", "terima", "kembalian", "hadiah", "thr", "omset", "pemasukan", "masuk", "+", "in"];
  const isIncome = incomeKeywords.some((k) => lower.includes(k));
  const type: 'pengeluaran' | 'pemasukan' = isIncome ? "pemasukan" : "pengeluaran";
  const desc = extractDescriptionFromText(userMessage, incomeKeywords) || (type === "pemasukan" ? "Pemasukan" : "Pengeluaran");

  return {
    type,
    amount: amt,
    description: cleanDescription(desc),
    category: guessCategory(desc, type),
  };
}

// Resilient Gemini AI parser with model fallback (gemini-3.1-flash-lite -> gemini-3.8-flash)
async function parseWithGeminiAI(userMessage: string): Promise<any> {
  const ai = getGeminiClient();
  if (!ai) return null;

  const systemPrompt = `Kamu adalah Asisten Pencatat Keuangan Pribadi via Telegram berbahasa Indonesia yang sangat ramah, teliti, dan sopan.
Tugas kamu adalah mengekstrak data keuangan dari pesan pengguna.
Analisis pesan pengguna dan kembalikan JSON murni dengan format:
{
  "intent": "transaction" | "rekap" | "rekap_mingguan" | "edit" | "greeting" | "other",
  "type": "pengeluaran" | "pemasukan",
  "amount": number (dalam Rupiah penuh, contoh 25000 untuk 25rb, 1500000 untuk 1.5jt, 0 jika bukan transaksi),
  "description": string (keterangan ringkas & jelas),
  "category": string (contoh: Makanan & Minuman, Transportasi, Belanja, Tagihan, Gaji, Bisnis, dll)
}`;

  // Priority list: start with gemini-3.1-flash-lite (fast, highly available), fallback to gemini-3.8-flash
  const candidateModels = ["gemini-3.1-flash-lite", "gemini-3.8-flash"];

  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: userMessage,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const text = response.text?.trim();
      if (text) {
        return JSON.parse(text);
      }
    } catch (err: any) {
      const isUnavailable =
        err?.status === 503 ||
        err?.message?.includes("503") ||
        err?.message?.includes("UNAVAILABLE") ||
        err?.message?.includes("high demand");

      if (isUnavailable) {
        console.warn(`[Gemini] Model ${model} sedang mengalami antrean tinggi (503). Mengalihkan ke model cadangan...`);
      } else {
        console.warn(`[Gemini] Catatan pada model ${model}:`, err?.message || err);
      }
      // Proceed to the next model in the fallback chain
    }
  }

  return null;
}

// Processing message with Gemini AI enhancement and robust heuristics
async function processMessage(userMessage: string): Promise<{
  reply: string;
  transaction?: StoredTransaction;
  isRekap?: boolean;
}> {
  const trimmed = userMessage.trim();
  const lower = trimmed.toLowerCase();

  // 1. Dedicated check for EDIT TRANSACTION command
  const isEditCmd =
    lower === "edit" ||
    lower === "/edit" ||
    lower.startsWith("edit ") ||
    lower.startsWith("/edit ") ||
    lower === "ralat" ||
    lower.startsWith("ralat ") ||
    lower === "/ralat" ||
    lower.startsWith("/ralat ") ||
    lower === "ganti" ||
    lower.startsWith("ganti ") ||
    lower === "ubah" ||
    lower.startsWith("ubah ") ||
    lower === "revisi" ||
    lower.startsWith("revisi ") ||
    lower === "cara edit" ||
    lower === "edit transaksi";

  if (isEditCmd) {
    return handleChatEditCommand(trimmed);
  }

  // 2. Dedicated check for REKAP MINGGUAN (Weekly Recap)
  const isWeeklyRekap =
    lower.includes("rekap mingguan") ||
    lower.includes("rekap minggu ini") ||
    lower.includes("rekap seminggu") ||
    lower.includes("rekap 7 hari") ||
    lower.includes("rekap 1 minggu") ||
    lower === "/rekap_mingguan" ||
    lower === "/mingguan" ||
    lower === "mingguan" ||
    lower.includes("laporan mingguan") ||
    lower.includes("laporan seminggu") ||
    lower.includes("pengeluaran minggu ini") ||
    lower.includes("pengeluaran mingguan") ||
    lower.includes("pemasukan minggu ini") ||
    lower.includes("pemasukan mingguan") ||
    lower.includes("keuangan minggu ini");

  if (isWeeklyRekap) {
    const summary = getFinancialSummary();
    return { reply: formatRekapMingguanReply(summary), isRekap: true };
  }

  // 3. Fast heuristic check (Daily rekap, greetings, quick shortcuts)
  const heuristic = parseIndonesianHeuristic(userMessage);

  if (heuristic) {
    if (heuristic.isGreeting) {
      return { reply: formatGreetingReply() };
    }

    if (heuristic.isRekap) {
      const summary = getFinancialSummary();
      const now = new Date();
      const todayTrans = transactions
        .filter((t) => isSameDay(new Date(t.timestamp), now))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return { reply: formatRekapReply(summary, todayTrans), isRekap: true };
    }

    if (heuristic.isTransaction && heuristic.type && heuristic.amount && heuristic.description) {
      const newTransaction: StoredTransaction = {
        id: "tx-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
        type: heuristic.type,
        amount: heuristic.amount,
        description: heuristic.description,
        category: heuristic.category || guessCategory(heuristic.description, heuristic.type),
        timestamp: new Date().toISOString(),
        rawMessage: userMessage,
      };

      transactions.unshift(newTransaction);
      saveTransactions();

      const summary = getFinancialSummary();
      return {
        reply: formatTransactionReply(newTransaction, summary),
        transaction: newTransaction,
      };
    }
  }

  // 4. Intelligent AI parsing with resilient failover
  const parsedJson = await parseWithGeminiAI(userMessage);

  if (parsedJson) {
    if (parsedJson.intent === "rekap_mingguan") {
      const summary = getFinancialSummary();
      return { reply: formatRekapMingguanReply(summary), isRekap: true };
    }

    if (parsedJson.intent === "edit") {
      return handleChatEditCommand(trimmed);
    }

    if (parsedJson.intent === "rekap") {
      const summary = getFinancialSummary();
      const now = new Date();
      const todayTrans = transactions
        .filter((t) => isSameDay(new Date(t.timestamp), now))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return { reply: formatRekapReply(summary, todayTrans), isRekap: true };
    }

    if (parsedJson.intent === "greeting") {
      return { reply: formatGreetingReply() };
    }

    if (parsedJson.intent === "transaction" && parsedJson.amount > 0) {
      const txType = parsedJson.type === "pemasukan" ? "pemasukan" : "pengeluaran";
      const newTransaction: StoredTransaction = {
        id: "tx-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
        type: txType,
        amount: Math.round(parsedJson.amount),
        description: cleanDescription(parsedJson.description || "Transaksi"),
        category: parsedJson.category || guessCategory(parsedJson.description || "", txType),
        timestamp: new Date().toISOString(),
        rawMessage: userMessage,
      };

      transactions.unshift(newTransaction);
      saveTransactions();

      const summary = getFinancialSummary();
      return {
        reply: formatTransactionReply(newTransaction, summary),
        transaction: newTransaction,
      };
    }
  }

  // 3. Emergency NLP parser (if AI models were busy or unavailable)
  const emergency = emergencyFallbackParser(userMessage);
  if (emergency) {
    const newTransaction: StoredTransaction = {
      id: "tx-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      type: emergency.type,
      amount: emergency.amount,
      description: emergency.description,
      category: emergency.category,
      timestamp: new Date().toISOString(),
      rawMessage: userMessage,
    };

    transactions.unshift(newTransaction);
    saveTransactions();

    const summary = getFinancialSummary();
    return {
      reply: formatTransactionReply(newTransaction, summary),
      transaction: newTransaction,
    };
  }

  // Fallback if message wasn't understood
  return {
    reply: `Mohon maaf Kak, saya belum dapat mengenali nominal transaksi dari pesan:
_"${userMessage}"_ 😅

Bisa dibantu dengan format seperti:
• 🔴 _"beli makan 25rb"_ atau _"K 25000 makan"_
• 🟢 _"dapat bonus 100rb"_ atau _"M 100000 bonus"_
• 📊 Ketik *_REKAP_* untuk melihat saldo hari ini.`,
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Chat endpoint (Simulating Telegram Message)
  app.post("/api/chat", async (req, res) => {
    try {
      const { message } = req.body;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Pesan tidak boleh kosong" });
      }

      const result = await processMessage(message);
      res.json(result);
    } catch (err: any) {
      console.error("Chat error:", err);
      res.status(500).json({
        error: "Terjadi kesalahan pada server",
        details: err?.message || String(err),
      });
    }
  });

  // Get all transactions
  app.get("/api/transactions", (req, res) => {
    const { type, filterDate, search, category } = req.query;
    let list = [...transactions];

    if (type && (type === "pengeluaran" || type === "pemasukan")) {
      list = list.filter((t) => t.type === type);
    }

    if (category && typeof category === "string" && category !== "all") {
      list = list.filter((t) => t.category.toLowerCase() === category.toLowerCase());
    }

    if (filterDate === "today") {
      const now = new Date();
      list = list.filter((t) => isSameDay(new Date(t.timestamp), now));
    } else if (filterDate === "week") {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      list = list.filter((t) => new Date(t.timestamp) >= weekAgo);
    }

    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.description.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          t.amount.toString().includes(q)
      );
    }

    res.json({ transactions: list, summary: getFinancialSummary() });
  });

  // Add transaction manually
  app.post("/api/transactions", (req, res) => {
    const { type, amount, description, category } = req.body;
    if (!type || !amount || !description) {
      return res.status(400).json({ error: "Field type, amount, dan description wajib diisi" });
    }

    const txType: 'pengeluaran' | 'pemasukan' = type === "pemasukan" ? "pemasukan" : "pengeluaran";
    const numAmount = parseInt(amount, 10);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: "Nominal harus berupa angka positif" });
    }

    const newTx: StoredTransaction = {
      id: "tx-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      type: txType,
      amount: numAmount,
      description: cleanDescription(description),
      category: category || guessCategory(description, txType),
      timestamp: new Date().toISOString(),
      rawMessage: `Manual input: ${description} ${numAmount}`,
    };

    transactions.unshift(newTx);
    saveTransactions();

    res.status(201).json({
      transaction: newTx,
      summary: getFinancialSummary(),
    });
  });

  // Edit/Update transaction
  app.put("/api/transactions/:id", (req, res) => {
    const { id } = req.params;
    const { type, amount, description, category, timestamp } = req.body;

    const index = transactions.findIndex((t) => t.id === id);
    if (index === -1) {
      return res.status(404).json({ error: "Transaksi tidak ditemukan" });
    }

    const current = transactions[index];
    const updatedType: 'pengeluaran' | 'pemasukan' =
      type === "pemasukan" || type === "pengeluaran" ? type : current.type;

    let updatedAmount = current.amount;
    if (amount !== undefined) {
      const parsedAmount = parseInt(amount, 10);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: "Nominal harus berupa angka positif" });
      }
      updatedAmount = parsedAmount;
    }

    const updatedDesc = description ? cleanDescription(description) : current.description;
    const updatedCat = category || current.category || guessCategory(updatedDesc, updatedType);

    const updatedTx: StoredTransaction = {
      ...current,
      type: updatedType,
      amount: updatedAmount,
      description: updatedDesc,
      category: updatedCat,
      timestamp: timestamp && !isNaN(new Date(timestamp).getTime()) ? new Date(timestamp).toISOString() : current.timestamp,
    };

    transactions[index] = updatedTx;
    saveTransactions();

    res.json({
      success: true,
      transaction: updatedTx,
      summary: getFinancialSummary(),
    });
  });

  // Delete transaction
  app.delete("/api/transactions/:id", (req, res) => {
    const { id } = req.params;
    const initialLen = transactions.length;
    transactions = transactions.filter((t) => t.id !== id);

    if (transactions.length === initialLen) {
      return res.status(404).json({ error: "Transaksi tidak ditemukan" });
    }

    saveTransactions();
    res.json({ success: true, summary: getFinancialSummary() });
  });

  // Clear all transactions (requires explicit confirmation to protect data)
  app.delete("/api/transactions", (req, res) => {
    const { confirm } = req.query;
    if (confirm !== "true") {
      return res.status(400).json({
        error: "Konfirmasi diperlukan. Tambahkan query ?confirm=true untuk menghapus data secara sengaja.",
      });
    }
    transactions = [];
    saveTransactions();
    res.json({ success: true, summary: getFinancialSummary() });
  });

  // Get Rekap Harian
  app.get("/api/rekap", (_req, res) => {
    const summary = getFinancialSummary();
    const now = new Date();
    const todayList = transactions
      .filter((t) => isSameDay(new Date(t.timestamp), now))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({
      summary,
      todayTransactions: todayList,
      textFormat: formatRekapReply(summary, todayList),
    });
  });

  // Get Rekap Mingguan (7 Hari)
  app.get("/api/rekap/mingguan", (_req, res) => {
    const summary = getFinancialSummary();
    res.json({
      summary,
      textFormat: formatRekapMingguanReply(summary),
    });
  });

  // Export CSV endpoint (Google Sheets & Excel compatible)
  app.get("/api/export/csv", (_req, res) => {
    const headers = ["ID", "Waktu", "Tipe", "Kategori", "Keterangan", "Nominal (Rp)", "Teks Asli"];
    const rows = transactions.map((t) => {
      const dateStr = new Date(t.timestamp).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
      const tipeLabel = t.type === "pemasukan" ? "Pemasukan (🟢)" : "Pengeluaran (🔴)";
      const escape = (val: string) => `"${(val || "").replace(/"/g, '""')}"`;
      return [
        escape(t.id),
        escape(dateStr),
        escape(tipeLabel),
        escape(t.category),
        escape(t.description),
        t.amount,
        escape(t.rawMessage || ""),
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n"); // UTF-8 BOM for Excel/Sheets
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="catatan-keuangan-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csvContent);
  });

  // Real Telegram Webhook & Polling Support with 24/7 Watchdog Supervisor
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8979526130:AAGyGaCFUENxa6t6PkpAyo8qKi52K_83LXA";
  const serverStartedAt = new Date().toISOString();
  let watchdogRestartCount = 0;
  let keepAliveCount = 0;
  let isWebhookMode = false;
  let configuredWebhookUrl: string | null = null;

  const telegramBotState = {
    connected: false,
    botInfo: null as { id: number; username: string; first_name: string } | null,
    pollingActive: false,
    lastPolledAt: null as string | null,
    lastError: null as string | null,
    processedUpdatesCount: 0,
  };

  async function sendTelegramReply(chatId: number | string, text: string) {
    try {
      const sendUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      const res = await fetch(sendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: "Markdown",
        }),
      });

      const resData: any = await res.json();
      if (!resData.ok) {
        console.warn("[Telegram] Gagal kirim dengan Markdown, mencoba format teks biasa...", resData.description);
        await fetch(sendUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: text.replace(/[*_`]/g, ""),
          }),
        });
      }
    } catch (sendErr) {
      console.error("[Telegram] Error mengirim balasan ke Telegram:", sendErr);
    }
  }

  let lastUpdateId = 0;
  let isPolling = false;
  let pollingAbortController: AbortController | null = null;

  async function startTelegramPolling() {
    if (isWebhookMode) {
      console.log("[Telegram] Mode Webhook aktif, long polling dinonaktifkan.");
      return;
    }
    if (isPolling) return;
    isPolling = true;
    telegramBotState.pollingActive = true;
    console.log("[Telegram 24/7] Long polling aktif & diawasi Watchdog Supervisor untuk @Hahaha_uangbot...");

    while (isPolling && !isWebhookMode) {
      try {
        telegramBotState.lastPolledAt = new Date().toISOString();
        pollingAbortController = new AbortController();
        const timeoutId = setTimeout(() => pollingAbortController?.abort(), 30000);

        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=20`;
        const response = await fetch(url, { signal: pollingAbortController.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
          console.error(`[Telegram] getUpdates HTTP status: ${response.status}`);
          await new Promise((resolve) => setTimeout(resolve, 3000));
          continue;
        }

        const data: any = await response.json();
        if (!data.ok) {
          telegramBotState.lastError = data.description || "Polling error";
          // If conflict (e.g. webhook was active elsewhere), wait briefly
          await new Promise((resolve) => setTimeout(resolve, 3000));
          continue;
        }

        telegramBotState.lastError = null;
        const updates = data.result || [];
        for (const update of updates) {
          lastUpdateId = Math.max(lastUpdateId, update.update_id);
          telegramBotState.processedUpdatesCount++;

          const messageObj = update.message || update.edited_message;
          if (!messageObj) continue;

          const text = messageObj.text;
          const chatId = messageObj.chat?.id;
          const fromUser = messageObj.from?.first_name || "User";

          if (text && chatId) {
            console.log(`[Telegram] Pesan masuk dari ${fromUser} (${chatId}): "${text}"`);
            const result = await processMessage(text);
            await sendTelegramReply(chatId, result.reply);
          }
        }
      } catch (pollErr: any) {
        if (pollErr.name !== "TimeoutError" && pollErr.name !== "AbortError") {
          console.warn("[Telegram] Polling hiccup (auto-reconnect 2s):", pollErr?.message || pollErr);
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  // 24/7 Watchdog Supervisor: Pantau dan hidupkan ulang jika polling macet > 45 detik
  setInterval(() => {
    if (isWebhookMode) return;
    if (!telegramBotState.connected) return;

    const now = Date.now();
    const lastPolled = telegramBotState.lastPolledAt ? new Date(telegramBotState.lastPolledAt).getTime() : 0;
    const diff = now - lastPolled;

    // Jika polling tidak update dalam 45 detik, lakukan recovery
    if (diff > 45000) {
      console.warn(`[Watchdog 24/7] Polling tidak merespons selama ${Math.round(diff / 1000)}s. Melakukan auto-revive...`);
      watchdogRestartCount++;
      if (pollingAbortController) {
        try {
          pollingAbortController.abort();
        } catch (_) {}
      }
      isPolling = false;
      startTelegramPolling();
    }
  }, 15000);

  // Keep-Alive Heartbeat Internal: Mencegah thread Node.js idle mati
  setInterval(async () => {
    try {
      keepAliveCount++;
      // internal health ping
      const res = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (!res.ok) {
        console.warn("[Keep-Alive 24/7] Health check response:", res.status);
      }
    } catch (e) {
      // ignore
    }
  }, 120000); // setiap 2 menit

  async function initTelegramBot() {
    if (!TELEGRAM_BOT_TOKEN) return;

    try {
      const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);
      const data: any = await res.json();
      if (data.ok) {
        telegramBotState.connected = true;
        telegramBotState.botInfo = {
          id: data.result.id,
          username: data.result.username,
          first_name: data.result.first_name,
        };
        telegramBotState.lastError = null;
        console.log(`[Telegram] Terhubung ke Bot Telegram: @${data.result.username} (${data.result.first_name})`);

        // Check if Webhook is already set on Telegram
        try {
          const webhookCheckRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`);
          const webhookInfo: any = await webhookCheckRes.json();
          if (webhookInfo.ok && webhookInfo.result?.url) {
            isWebhookMode = true;
            configuredWebhookUrl = webhookInfo.result.url;
            console.log(`[Telegram] Bot menggunakan mode Webhook: ${configuredWebhookUrl}`);
            return;
          }
        } catch (e) {
          // ignore
        }

        // Remove any stale webhook to allow long polling
        try {
          await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook?drop_pending_updates=false`);
        } catch (e) {
          // ignore
        }

        isWebhookMode = false;
        startTelegramPolling();
      } else {
        telegramBotState.connected = false;
        telegramBotState.lastError = data.description;
        console.error("[Telegram] Gagal verifikasi bot token:", data.description);
      }
    } catch (err: any) {
      telegramBotState.connected = false;
      telegramBotState.lastError = err?.message || String(err);
      console.error("[Telegram] Error inisialisasi:", err);
    }
  }

  // Telegram status endpoint
  app.get("/api/telegram/status", (_req, res) => {
    const uptimeSeconds = Math.floor((Date.now() - new Date(serverStartedAt).getTime()) / 1000);
    res.json({
      connected: telegramBotState.connected,
      botInfo: telegramBotState.botInfo,
      pollingActive: !isWebhookMode && telegramBotState.pollingActive,
      lastPolledAt: telegramBotState.lastPolledAt,
      lastError: telegramBotState.lastError,
      processedUpdatesCount: telegramBotState.processedUpdatesCount,
      watchdogRestartCount,
      keepAliveCount,
      uptimeSeconds,
      isWebhookMode,
      webhookUrl: configuredWebhookUrl,
      serverStartedAt,
    });
  });

  // Reconnect endpoint
  app.post("/api/telegram/reconnect", async (_req, res) => {
    isPolling = false;
    await initTelegramBot();
    res.json({
      connected: telegramBotState.connected,
      botInfo: telegramBotState.botInfo,
      pollingActive: !isWebhookMode && telegramBotState.pollingActive,
      isWebhookMode,
    });
  });

  // Webhook management endpoints
  app.get("/api/telegram/webhook/info", async (_req, res) => {
    try {
      const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`);
      const data = await resp.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  app.post("/api/telegram/webhook/set", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== "string" || !url.startsWith("https://")) {
        return res.status(400).json({ ok: false, error: "URL webhook wajib HTTPS yang valid" });
      }

      // Stop polling before setting webhook
      isPolling = false;
      if (pollingAbortController) {
        try { pollingAbortController.abort(); } catch (_) {}
      }

      const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${encodeURIComponent(url)}&drop_pending_updates=false`);
      const tgData: any = await tgRes.json();

      if (tgData.ok) {
        isWebhookMode = true;
        configuredWebhookUrl = url;
        telegramBotState.pollingActive = false;
        console.log(`[Telegram] Webhook berhasil dipasang ke: ${url}`);
        return res.json({ ok: true, webhookUrl: url, description: tgData.description });
      } else {
        return res.status(400).json({ ok: false, error: tgData.description });
      }
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  app.post("/api/telegram/webhook/delete", async (_req, res) => {
    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook?drop_pending_updates=false`);
      const tgData: any = await tgRes.json();

      isWebhookMode = false;
      configuredWebhookUrl = null;
      startTelegramPolling();

      res.json({ ok: true, message: "Webhook dihapus, mode Long Polling 24/7 aktif kembali.", tgData });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  // Telegram Webhook Receiver
  app.post("/api/telegram-webhook", async (req, res) => {
    try {
      const update = req.body;
      const messageObj = update?.message || update?.edited_message;
      const message = messageObj?.text;
      const chatId = messageObj?.chat?.id;
      const fromUser = messageObj?.from?.first_name || "User";

      if (message && chatId) {
        telegramBotState.processedUpdatesCount++;
        console.log(`[Telegram Webhook] Pesan dari ${fromUser} (${chatId}): "${message}"`);
        const result = await processMessage(message);
        await sendTelegramReply(chatId, result.reply);
      }

      res.json({ ok: true });
    } catch (webhookErr) {
      console.error("Telegram webhook error:", webhookErr);
      res.status(200).json({ ok: false });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server pencatat keuangan Telegram berjalan di port ${PORT}`);
    initTelegramBot();
  });
}

startServer();
