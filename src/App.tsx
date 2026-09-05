import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bot,
  FileSpreadsheet,
  HelpCircle,
  PlusCircle,
  Send,
  Sparkles,
  Zap,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Database,
  Download,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import { User } from 'firebase/auth';
import TelegramChat, { TelegramChatHandle } from './components/TelegramChat';
import TransactionDatabase from './components/TransactionDatabase';
import ManualTransactionModal from './components/ManualTransactionModal';
import TelegramBotGuideModal from './components/TelegramBotGuideModal';
import GoogleSheetsModal from './components/GoogleSheetsModal';
import { Transaction, DailySummary, TransactionType, TelegramBotStatus } from './types';
import { formatRupiah } from './utils/formatters';
import {
  initAuth,
  googleSignIn,
  logout,
  getSavedSpreadsheetId,
  getSavedSpreadsheetName,
  syncAllTransactionsToSheet,
  saveSpreadsheetInfo,
} from './services/googleSheets';

export default function App() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [botStatus, setBotStatus] = useState<TelegramBotStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'database'>('chat');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [guideInitialTab, setGuideInitialTab] = useState<'format' | 'always_on' | 'sheets' | 'status'>('always_on');
  const chatRef = useRef<TelegramChatHandle>(null);

  // Google Auth & Google Sheets State
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(getSavedSpreadsheetId());
  const [spreadsheetName, setSpreadsheetName] = useState<string>(getSavedSpreadsheetName());
  const [isSyncingGoogleSheets, setIsSyncingGoogleSheets] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Initialize Firebase Auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setAuthUser(user);
        setAuthToken(token);
      },
      () => {
        setAuthUser(null);
        setAuthToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Fetch transactions and financial summary
  const loadData = useCallback(async (showLoadingSpinner = false) => {
    try {
      if (showLoadingSpinner) setIsLoading(true);
      const res = await fetch('/api/transactions');
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
        setSummary(data.summary || null);
      }
    } catch (err) {
      console.error('Failed to load transactions:', err);
    } finally {
      if (showLoadingSpinner) setIsLoading(false);
    }
  }, []);

  // Fetch Telegram bot status
  const loadBotStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/telegram/status');
      if (res.ok) {
        const data: TelegramBotStatus = await res.json();
        setBotStatus(data);
      }
    } catch (err) {
      console.error('Failed to check Telegram bot status:', err);
    }
  }, []);

  useEffect(() => {
    loadData(true);
    loadBotStatus();

    // Auto-refresh interval every 3 seconds to catch live updates from real Telegram bot
    const interval = setInterval(() => {
      loadData(false);
      loadBotStatus();
    }, 3000);

    const onFocus = () => {
      loadData(false);
      loadBotStatus();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadData, loadBotStatus]);

  // Google Sign-In and Sign-Out Handlers
  const handleGoogleSignIn = async () => {
    try {
      setIsLoggingIn(true);
      const result = await googleSignIn();
      if (result) {
        setAuthUser(result.user);
        setAuthToken(result.accessToken);
        // Langsung pindahkan dan sinkronkan semua data transaksi yang sudah ada ke spreadsheet utama
        if (spreadsheetId) {
          try {
            setIsSyncingGoogleSheets(true);
            const res = await fetch('/api/transactions');
            const data = await res.json();
            const txList = data.transactions || transactions;
            if (txList.length > 0) {
              await syncAllTransactionsToSheet(result.accessToken, spreadsheetId, txList);
              setLastSyncTime(new Date());
            }
          } catch (syncErr) {
            console.warn('Initial sync after Google login:', syncErr);
          } finally {
            setIsSyncingGoogleSheets(false);
          }
        }
      }
    } catch (err) {
      console.error('Login error:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    try {
      await logout();
      setAuthUser(null);
      setAuthToken(null);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Sync transactions to Google Sheets
  const handleSyncGoogleSheets = async () => {
    if (!authToken || !spreadsheetId) {
      setIsGoogleModalOpen(true);
      return;
    }
    try {
      setIsSyncingGoogleSheets(true);
      await syncAllTransactionsToSheet(authToken, spreadsheetId, transactions);
      setLastSyncTime(new Date());
    } catch (err) {
      console.error('Failed to sync to Google Sheets:', err);
      setIsGoogleModalOpen(true);
    } finally {
      setIsSyncingGoogleSheets(false);
    }
  };

  // Auto-sync helper after any transaction mutation
  const autoSyncToSheetIfConnected = async () => {
    if (authToken && spreadsheetId) {
      try {
        const res = await fetch('/api/transactions');
        if (res.ok) {
          const data = await res.json();
          await syncAllTransactionsToSheet(authToken, spreadsheetId, data.transactions || []);
          setLastSyncTime(new Date());
        }
      } catch (err) {
        console.warn('Auto-sync to Google Sheet failed:', err);
      }
    }
  };

  // Handle manual transaction addition
  const handleAddManualTransaction = async (tx: {
    type: TransactionType;
    amount: number;
    description: string;
    category: string;
  }) => {
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tx),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Gagal menyimpan transaksi');
    }

    await loadData();
    autoSyncToSheetIfConnected();
  };

  // Handle transaction deletion
  const handleDeleteTransaction = async (id: string) => {
    const res = await fetch(`/api/transactions/${id}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      await loadData();
      autoSyncToSheetIfConnected();
    }
  };

  // Handle transaction editing
  const handleEditTransaction = async (
    id: string,
    updatedTx: {
      type: TransactionType;
      amount: number;
      description: string;
      category: string;
      timestamp?: string;
    }
  ) => {
    const res = await fetch(`/api/transactions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedTx),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Gagal memperbarui transaksi');
    }

    await loadData();
    autoSyncToSheetIfConnected();
  };

  const handleQuickPromptClick = (text: string) => {
    setActiveTab('chat');
    chatRef.current?.sendQuickPrompt(text);
  };

  const handleExportCsv = () => {
    window.location.href = '/api/export/csv';
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 sm:p-6 lg:p-8 flex flex-col font-sans">
      <div className="max-w-7xl w-full mx-auto flex flex-col flex-grow">
        {/* Bento Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
                <Bot className="w-6 h-6 text-sky-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-800">
                  Asisten Keuangan Telegram
                </h1>
                <p className="text-sm text-slate-500 font-medium">
                  Monitoring Dashboard & Data Extraction
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            {/* Google Sheets Sync & Status Button */}
            <button
              type="button"
              id="top-sheets-btn"
              onClick={() => setIsGoogleModalOpen(true)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl border text-xs font-semibold shadow-2xs transition-colors cursor-pointer ${
                spreadsheetId
                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
              }`}
              title="Kelola Penyimpanan Google Sheets"
            >
              <FileSpreadsheet className={`w-3.5 h-3.5 ${spreadsheetId ? 'text-emerald-600' : 'text-slate-500'}`} />
              <span className="hidden sm:inline">Google Sheet:</span>
              <span className={spreadsheetId ? 'text-emerald-700 font-bold max-w-[120px] truncate' : 'text-slate-600 font-medium'}>
                {spreadsheetId ? (spreadsheetName || 'Tersambung') : 'Hubungkan'}
              </span>
              {spreadsheetId ? (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              ) : (
                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md font-bold">
                  Simpan
                </span>
              )}
            </button>

            {/* 24/7 Watchdog Status Button */}
            <button
              type="button"
              id="top-24h-btn"
              onClick={() => {
                setGuideInitialTab('always_on');
                setIsGuideModalOpen(true);
              }}
              className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 px-3 py-2 rounded-2xl shadow-2xs transition-colors cursor-pointer text-xs font-semibold"
              title="Status Pengawasan Aktif 24 Jam Nonstop"
            >
              <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span className="hidden sm:inline">24 Jam:</span>
              <span className="text-emerald-700 font-bold">Aktif & Terjaga</span>
            </button>

            {/* Telegram Live Connection Pill */}
            <a
              href={`https://t.me/${botStatus?.botInfo?.username || 'Hahaha_uangbot'}`}
              target="_blank"
              rel="noreferrer"
              title="Buka bot di aplikasi Telegram resmi"
              className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 px-3.5 py-2 rounded-2xl border border-slate-200 shadow-2xs transition-colors cursor-pointer text-xs font-semibold"
            >
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <span>Telegram: <strong className="text-sky-600">@{botStatus?.botInfo?.username || 'Hahaha_uangbot'}</strong></span>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded-md">
                Online
              </span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </a>

            {/* Guide Button */}
            <button
              type="button"
              id="top-guide-btn"
              onClick={() => {
                setGuideInitialTab('format');
                setIsGuideModalOpen(true);
              }}
              className="px-3.5 py-2 rounded-2xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <HelpCircle className="w-4 h-4 text-blue-600" />
              <span className="hidden sm:inline">Panduan Format & Bot</span>
              <span className="sm:hidden">Panduan</span>
            </button>

            {/* Input Manual Button */}
            <button
              type="button"
              id="top-manual-btn"
              onClick={() => setIsManualModalOpen(true)}
              className="px-4 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Input Manual</span>
            </button>
          </div>
        </header>

        {/* Top Bento Widgets Row */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-5 mb-5 sm:mb-6">
          {/* Bento Tile 1: Status Saldo Utama */}
          <div className="md:col-span-12 lg:col-span-5 bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Status Saldo Utama
              </h3>
              <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                Hari Ini
              </span>
            </div>

            <div className="my-2">
              <span className="text-sm text-slate-500 font-medium block mb-1">
                Sisa Saldo Hari Ini
              </span>
              <div className="flex items-baseline gap-2">
                <span className={`text-3xl sm:text-4xl font-black tracking-tight ${
                  (summary?.saldoHariIni || 0) >= 0 ? 'text-slate-900' : 'text-rose-600'
                }`}>
                  {formatRupiah(summary?.saldoHariIni || 0)}
                </span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
                  (summary?.saldoHariIni || 0) >= 0
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-rose-50 text-rose-700'
                }`}>
                  {(summary?.saldoHariIni || 0) >= 0 ? '🟢 Surplus' : '🔴 Defisit'}
                </span>
              </div>
            </div>

            {/* Income & Expense Bento Sub-Pills */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="bg-emerald-50/90 border border-emerald-100/80 p-3.5 rounded-2xl">
                <div className="flex items-center gap-1 mb-1">
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="block text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                    Pemasukan
                  </span>
                </div>
                <span className="text-base sm:text-lg font-black text-emerald-700">
                  {formatRupiah(summary?.totalPemasukan || 0)}
                </span>
              </div>

              <div className="bg-rose-50/90 border border-rose-100/80 p-3.5 rounded-2xl">
                <div className="flex items-center gap-1 mb-1">
                  <ArrowDownLeft className="w-3.5 h-3.5 text-rose-600" />
                  <span className="block text-[10px] font-bold text-rose-700 uppercase tracking-wider">
                    Pengeluaran
                  </span>
                </div>
                <span className="text-base sm:text-lg font-black text-rose-700">
                  {formatRupiah(summary?.totalPengeluaran || 0)}
                </span>
              </div>
            </div>

            {/* Total Kas Accumulation */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Akumulasi Total Saldo Kas</span>
              <span className="font-bold text-slate-800 font-mono text-sm">
                {formatRupiah(summary?.saldoKeseluruhan || 0)}
              </span>
            </div>
          </div>

          {/* Bento Tile 2: Intelligence & NLP Parser */}
          <div className="md:col-span-6 lg:col-span-4 bg-blue-600 text-white border-0 rounded-3xl p-6 shadow-xs flex flex-col justify-between relative overflow-hidden">
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-xs font-bold text-blue-100 uppercase tracking-widest">
                Intelligence
              </h3>
              <div className="p-1.5 bg-blue-500/80 rounded-xl text-white">
                <Zap className="w-4 h-4 fill-white" />
              </div>
            </div>

            <div className="my-1">
              <p className="text-xl font-bold tracking-tight">NLP Parser v2.1</p>
              <p className="text-xs text-blue-100/90 mt-1 leading-relaxed">
                Mengenali 14+ format percakapan santai & kode akuntansi singkat secara akurat.
              </p>
            </div>

            {/* Quick Prompt Test Chips */}
            <div className="mt-4 pt-3 border-t border-blue-500/50">
              <span className="text-[10px] uppercase font-bold text-blue-200 tracking-wider block mb-2">
                Coba Kirim Kilat:
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => handleQuickPromptClick('habis beli makan 20rb')}
                  className="text-[11px] font-medium bg-blue-700/80 hover:bg-blue-800 text-blue-100 px-2.5 py-1 rounded-xl transition-colors cursor-pointer"
                >
                  "beli makan 20rb"
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickPromptClick('K 15000 parkir')}
                  className="text-[11px] font-medium bg-blue-700/80 hover:bg-blue-800 text-blue-100 px-2.5 py-1 rounded-xl transition-colors cursor-pointer"
                >
                  "K 15000 parkir"
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickPromptClick('REKAP')}
                  className="text-[11px] font-medium bg-white/20 hover:bg-white/30 text-white px-2.5 py-1 rounded-xl transition-colors cursor-pointer"
                >
                  "REKAP"
                </button>
              </div>
            </div>
          </div>

          {/* Bento Tile 3: Google Sheets Live Sync & Storage */}
          <div className="md:col-span-6 lg:col-span-3 bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Penyimpanan Cloud
                </h3>
                <button
                  type="button"
                  onClick={loadData}
                  title="Segarkan data"
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="flex items-center gap-3 mb-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                  spreadsheetId ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                }`}>
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">
                    {spreadsheetId ? (spreadsheetName || 'Pembukuan Keuangan') : 'Google Sheets'}
                  </p>
                  <p className={`text-[11px] font-bold flex items-center gap-1 mt-0.5 ${
                    spreadsheetId ? 'text-emerald-600' : 'text-slate-500'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      spreadsheetId ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                    }`}></span>
                    {spreadsheetId ? 'Tersimpan Otomatis' : 'Belum Terhubung'}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2 mt-2 pt-2 border-t border-slate-100">
              {spreadsheetId ? (
                <>
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    <span>Buka Google Sheet</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={handleSyncGoogleSheets}
                    disabled={isSyncingGoogleSheets}
                    className="w-full py-1.5 px-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isSyncingGoogleSheets ? 'animate-spin' : ''}`} />
                    <span>{isSyncingGoogleSheets ? 'Menyinkronkan...' : 'Sinkronkan Sekarang'}</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  id="bento-connect-sheet-btn"
                  onClick={() => setIsGoogleModalOpen(true)}
                  className="w-full py-2.5 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Simpan ke Google Sheet</span>
                </button>
              )}
              <p className="text-[10px] text-slate-400 text-center">
                Total {transactions.length} transaksi tercatat
              </p>
            </div>
          </div>
        </div>

        {/* Mobile View Toggle (Tabs) */}
        <div className="lg:hidden mb-4 bg-white p-1 rounded-2xl border border-slate-200 flex items-center justify-center gap-2">
          <button
            type="button"
            id="mobile-tab-chat"
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'chat'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Chat Telegram</span>
          </button>
          <button
            type="button"
            id="mobile-tab-database"
            onClick={() => setActiveTab('database')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'database'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Database & Rekap ({transactions.length})</span>
          </button>
        </div>

        {/* Main Operational Bento Grid: Chat & Database */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-grow min-h-[580px]">
          {/* Left Column: Telegram Chat Simulator Bento Tile (5 cols) */}
          <div
            className={`h-full lg:col-span-5 ${
              activeTab === 'chat' ? 'block' : 'hidden lg:block'
            }`}
          >
            <TelegramChat
              ref={chatRef}
              onTransactionUpdated={loadData}
              onOpenGuide={() => setIsGuideModalOpen(true)}
              botStatus={botStatus}
            />
          </div>

          {/* Right Column: Ekstraksi Transaksi Terkini / Database Bento Tile (7 cols) */}
          <div
            className={`h-full lg:col-span-7 ${
              activeTab === 'database' ? 'block' : 'hidden lg:block'
            }`}
          >
            <TransactionDatabase
              transactions={transactions}
              summary={summary}
              isLoading={isLoading}
              onRefresh={loadData}
              onDelete={handleDeleteTransaction}
              onEdit={handleEditTransaction}
              onOpenManualModal={() => setIsManualModalOpen(true)}
              onOpenGuide={() => setIsGuideModalOpen(true)}
              onOpenGoogleSheetsModal={() => setIsGoogleModalOpen(true)}
              spreadsheetId={spreadsheetId}
              spreadsheetName={spreadsheetName}
              onSyncGoogleSheets={handleSyncGoogleSheets}
              isSyncingGoogleSheets={isSyncingGoogleSheets}
            />
          </div>
        </div>
      </div>

      {/* Modals */}
      <ManualTransactionModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onAdd={handleAddManualTransaction}
      />

      <TelegramBotGuideModal
        isOpen={isGuideModalOpen}
        onClose={() => setIsGuideModalOpen(false)}
        botStatus={botStatus}
        initialTab={guideInitialTab}
      />

      <GoogleSheetsModal
        isOpen={isGoogleModalOpen}
        onClose={() => setIsGoogleModalOpen(false)}
        user={authUser}
        token={authToken}
        onSignIn={handleGoogleSignIn}
        onSignOut={handleGoogleSignOut}
        isLoggingIn={isLoggingIn}
        spreadsheetId={spreadsheetId}
        spreadsheetName={spreadsheetName}
        onSpreadsheetLinked={(id, name) => {
          setSpreadsheetId(id);
          setSpreadsheetName(name);
          saveSpreadsheetInfo(id, name);
        }}
        transactions={transactions}
        lastSyncTime={lastSyncTime}
        setLastSyncTime={setLastSyncTime}
      />
    </div>
  );
}
