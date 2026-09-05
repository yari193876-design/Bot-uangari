import express from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import {
  isServiceAccountConfigured,
  getServiceAccountEmail,
  syncAllTransactionsToSheets,
  triggerBackgroundGoogleSheetsSync,
} from "./server/googleSheetsService";

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

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "transactions.json");
const BACKUP_FILE = path.join(DATA_DIR, "transactions.bak.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

export const TARGET_SPREADSHEET_ID = "1w7BDRLWI9qHFL0FJxrvBPEbDkifDOCJdvVlr_c5PM_A";
export const TARGET_SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${TARGET_SPREADSHEET_ID}/edit`;

export function extractSpreadsheetId(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}

export function getActiveSpreadsheetId(): string {
  if (process.env.SPREADSHEET_ID && process.env.SPREADSHEET_ID.trim()) {
    return extractSpreadsheetId(process.env.SPREADSHEET_ID);
  }
  if (process.env.GOOGLE_SHEETS_SPREADSHEET_ID && process.env.GOOGLE_SHEETS_SPREADSHEET_ID.trim()) {
    return extractSpreadsheetId(process.env.GOOGLE_SHEETS_SPREADSHEET_ID);
  }
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
      if (parsed.spreadsheetId && typeof parsed.spreadsheetId === "string" && parsed.spreadsheetId.trim()) {
        return extractSpreadsheetId(parsed.spreadsheetId);
      }
    }
  } catch (_) {}
  return TARGET_SPREADSHEET_ID;
}

export function getActiveSpreadsheetUrl(): string {
  return `https://docs.google.com/spreadsheets/d/${getActiveSpreadsheetId()}/edit`;
}

export function setActiveSpreadsheetId(id: string) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    let settings: any = {};
    if (fs.existsSync(SETTINGS_FILE)) {
      settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8")) || {};
    }
    settings.spreadsheetId = id;
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
  } catch (_) {}
}

export function getGasWebhookUrl(): string | null {
  if (process.env.GAS_WEBHOOK_URL) return process.env.GAS_WEBHOOK_URL;
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
      return parsed.gasWebhookUrl || null;
    }
  } catch (_) {}
  return null;
}

export function setGasWebhookUrl(url: string | null) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    let settings: any = {};
    if (fs.existsSync(SETTINGS_FILE)) {
      settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8")) || {};
    }
    settings.gasWebhookUrl = url;
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
  } catch (_) {}
}

export async function forwardTransactionToGas(t: StoredTransaction) {
  const url = getGasWebhookUrl();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "append_transaction",
        transaction: t,
        spreadsheetId: getActiveSpreadsheetId(),
      }),
    });
  } catch (e) {
    console.warn("[GAS Webhook] Gagal meneruskan transaksi ke Apps Script:", e);
  }
}

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
          try {
            fs.copyFileSync(DATA_FILE, BACKUP_FILE);
          } catch (_) {}
          return parsed;
        }
      }
    }
    if (fs.existsSync(BACKUP_FILE)) {
      const bakContent = fs.readFileSync(BACKUP_FILE, "utf-8");
      if (bakContent.trim()) {
        const parsedBak = JSON.parse(bakContent);
        if (Array.isArray(parsedBak)) {
          try {
            fs.copyFileSync(BACKUP_FILE, DATA_FILE);
          } catch (_) {}
          return parsedBak;
        }
      }
    }
  } catch (err) {
    console.error("Gagal membaca file transaksi:", err);
  }

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
    
    if (fs.existsSync(DATA_FILE)) {
      try {
        fs.copyFileSync(DATA_FILE, BACKUP_FILE);
      } catch (_) {}
    }
    fs.renameSync(tempFile, DATA_FILE);

    triggerBackgroundGoogleSheetsSync(transactions, getActiveSpreadsheetId()).catch((err) => {
      console.error("[Sheets Sync Error]:", err);
    });
  } catch (err) {
    console.error("Gagal menyimpan transaksi (atomic):", err);
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(transactions, null, 2), "utf-8");
      triggerBackgroundGoogleSheetsSync(transactions, getActiveSpreadsheetId()).catch((err) => {
        console.error("[Sheets Sync Fallback Error]:", err);
      });
    } catch (writeErr) {
      console.error("Gagal menyimpan fallback transaksi:", writeErr);
    }
  }
}

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function toWibDate(date: Date): Date {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000);
}

function formatIndoDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  const wib = toWibDate(date);
  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const dayName = days[wib.getUTCDay()];
  const day = String(wib.getUTCDate()).padStart(2, "0");
  const monthName = months[wib.getUTCMonth()];
  const year = wib.getUTCFullYear();
  const hours = String(wib.getUTCHours()).padStart(2, "0");
  const mins = String(wib.getUTCMinutes()).padStart(2, "0");

  return `${dayName}, ${day} ${monthName} ${year} • ${hours}:${mins} WIB`;
}

function isSameDay(d1: Date, d2: Date): boolean {
  const wib1 = toWibDate(d1);
  const wib2 = toWibDate(d2);
  return (
    wib1.getUTCFullYear() === wib2.getUTCFullYear() &&
    wib1.getUTCMonth() === wib2.getUTCMonth() &&
    wib1.getUTCDate() === wib2.getUTCDate()
  );
}

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
    totalPemasukan: totalPemasukanHariIni,
    totalPengeluaran: totalPengeluaranHariIni,
    transactionCount: countHariIni,
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

function parseIndonesianHeuristic(text: string) {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (
    lower === "rekap" ||
    lower === "/rekap" ||
    lower.includes("rekap") ||
    lower.includes("cek saldo") ||
    lower.includes("sisa saldo") ||
    lower.includes("saldo hari ini") ||
    lower.includes("rekap keuangan")
  ) {
    return { isTransaction: false, isRekap: true, isGreeting: false };
  }

  if (
    lower === "halo" ||
    lower === "hai" ||
    lower === "hi" ||
    lower === "assalamualaikum" ||
    lower === "/start" ||
    lower === "/help" ||
    lower === "bantuan"
  ) {
    return { isTransaction: false, isRekap: false, isGreeting: true };
  }

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

  const amountRegex = /(\d+(?:[.,]\d+)?)\s*(rb|ribu|k|jt|juta|k|m)?\b/i;
  if (amountRegex.test(trimmed)) {
    const incomeKeywords = ["dapat", "dapet", "gaji", "bonus", "transferan", "jual", "penjualan", "laba", "untung", "terima", "thr", "omset", "pemasukan", "masuk"];
    const expenseKeywords = ["beli", "habis", "bayar", "keluar", "makan", "minum", "jajan", "ongkos", "bensin", "parkir", "topup", "pulsa", "kuota", "belanja", "ngopi"];

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
  const digitsOnly = clean.replace(/[^\d]/g, "");
  return parseInt(digitsOnly, 10) || 0;
}

function extractAmountFromText(text: string): number {
  const match = text.match(/(?:rp\.?\s*)?(\d+(?:[.,]\d+)?)\s*(rb|ribu|k|jt|juta)?\b/i);
  if (match) {
    const full = (match[1] + (match[2] || "")).trim();
    return parseRupiahNumber(full);
  }
  return 0;
}

function extractDescriptionFromText(text: string, _keywords: string[]): string {
  let cleaned = text.replace(/(?:rp\.?\s*)?(\d+(?:[.,]\d+)?)\s*(rb|ribu|k|jt|juta)?\b/gi, "").trim();
  cleaned = cleaned.replace(/^(habis|udah|tadi|barusan|untuk|buat|ke|di)\s+/gi, "").trim();
  if (!cleaned) return "Transaksi";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function toTitleCase(str: string): string {
  if (!str) return "Transaksi";
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .trim();
}

function cleanDescription(desc: string): string {
  return toTitleCase(desc);
}

function guessCategory(desc: string, type: 'pengeluaran' | 'pemasukan'): string {
  const lower = desc.toLowerCase();
  if (type === "pemasukan") {
    if (lower.includes("gaji")) return "Gaji & Upah";
    if (lower.includes("bonus") || lower.includes("thr")) return "Bonus & Hadiah";
    if (lower.includes("jual")) return "Penjualan & Bisnis";
    return "Pendapatan Lainnya";
  }

  if (lower.includes("makan") || lower.includes("minum") || lower.includes("kopi") || lower.includes("jajan")) {
    return "Makanan & Minuman";
  }
  if (lower.includes("bensin") || lower.includes("parkir") || lower.includes("ojek")) {
    return "Transportasi";
  }
  if (lower.includes("listrik") || lower.includes("wifi") || lower.includes("pulsa")) {
    return "Tagihan & Utilitas";
  }
  return "Kebutuhan Harian";
}

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
🏦 *Saldo Total:* ${formatRupiah(summary.saldoKeseluruhan)}`;
}

async function processMessage(userMessage: string) {
  const heuristic = parseIndonesianHeuristic(userMessage);

  if (heuristic && heuristic.isTransaction && heuristic.type && heuristic.amount && heuristic.description) {
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
    forwardTransactionToGas(newTransaction);

    const summary = getFinancialSummary();
    return {
      reply: formatTransactionReply(newTransaction, summary),
      transaction: newTransaction,
    };
  }

  return {
    reply: "Pesan tidak dikenali sebagai transaksi.",
  };
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3001;
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8979526130:AAGyGaCFUENxa6t6PkpAyo8qKi52K_83LXA";

  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { message } = req.body;
      const result = await processMessage(message);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  // Listener Telegram (Polling 24/7)
  let lastUpdateId = 0;
  async function startTelegramPolling() {
    console.log("[Telegram] Long Polling Aktif...");
    while (true) {
      try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=20`;
        const response = await fetch(url);
        const data: any = await response.json();

        if (data.ok && data.result) {
          for (const update of data.result) {
            lastUpdateId = Math.max(lastUpdateId, update.update_id);
            const messageObj = update.message;
            if (messageObj && messageObj.text && messageObj.chat?.id) {
              const text = messageObj.text;
              const chatId = messageObj.chat.id;

              console.log(`[Telegram] Pesan masuk (${chatId}): "${text}"`);
              const result = await processMessage(text);

              await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: chatId, text: result.reply, parse_mode: "Markdown" }),
              });
            }
          }
        }
      } catch (pollErr) {
        await new Promise((res) => setTimeout(res, 3000));
      }
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server pencatat keuangan Telegram berjalan di port ${PORT}`);
    if (TELEGRAM_BOT_TOKEN) {
      startTelegramPolling();
    }
  });
}

startServer();
