import { useState, FormEvent } from 'react';
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Plus,
  Link2,
  X,
  LogOut,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  createNewSpreadsheet,
  verifySpreadsheet,
  syncAllTransactionsToSheet,
  saveSpreadsheetInfo,
  clearSpreadsheetInfo,
} from '../services/googleSheets';
import { Transaction } from '../types';

interface GoogleSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  token: string | null;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  isLoggingIn: boolean;
  spreadsheetId: string | null;
  spreadsheetName: string;
  onSpreadsheetLinked: (id: string, name: string) => void;
  transactions: Transaction[];
  lastSyncTime: Date | null;
  setLastSyncTime: (date: Date) => void;
}

export default function GoogleSheetsModal({
  isOpen,
  onClose,
  user,
  token,
  onSignIn,
  onSignOut,
  isLoggingIn,
  spreadsheetId,
  spreadsheetName,
  onSpreadsheetLinked,
  transactions,
  lastSyncTime,
  setLastSyncTime,
}: GoogleSheetsModalProps) {
  const [activeSubTab, setActiveSubTab] = useState<'status' | 'link_custom'>('status');
  const [customInput, setCustomInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showConfirmSync, setShowConfirmSync] = useState(false);

  if (!isOpen) return null;

  // Extract spreadsheet ID from URL or raw ID
  const extractSpreadsheetId = (input: string): string => {
    const trimmed = input.trim();
    const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (urlMatch && urlMatch[1]) {
      return urlMatch[1];
    }
    return trimmed;
  };

  // Create auto spreadsheet
  const handleCreateAutoSheet = async () => {
    if (!token) return;
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const created = await createNewSpreadsheet(token, 'Pembukuan Keuangan Telegram');
      onSpreadsheetLinked(created.spreadsheetId, created.title);
      // Immediately sync existing transactions
      if (transactions.length > 0) {
        await syncAllTransactionsToSheet(token, created.spreadsheetId, transactions);
        setLastSyncTime(new Date());
      }
      setStatusMessage({
        type: 'success',
        text: `Google Sheet "${created.title}" berhasil dibuat & disinkronkan!`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat Google Sheet';
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setIsProcessing(false);
    }
  };

  // Link existing spreadsheet
  const handleLinkExistingSheet = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !customInput.trim()) return;

    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const id = extractSpreadsheetId(customInput);
      const verified = await verifySpreadsheet(token, id);
      saveSpreadsheetInfo(id, verified.title);
      onSpreadsheetLinked(id, verified.title);
      setActiveSubTab('status');
      setCustomInput('');
      setStatusMessage({
        type: 'success',
        text: `Berhasil terhubung ke "${verified.title}".`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memverifikasi Google Sheet.';
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setIsProcessing(false);
    }
  };

  // Trigger sync all
  const handleExecuteSync = async () => {
    if (!token || !spreadsheetId) return;
    setShowConfirmSync(false);
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const result = await syncAllTransactionsToSheet(token, spreadsheetId, transactions);
      setLastSyncTime(new Date());
      setStatusMessage({
        type: 'success',
        text: `Berhasil menyinkronkan ${result.rowCount} transaksi ke Google Sheet!`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menyinkronkan data.';
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDisconnectSheet = () => {
    clearSpreadsheetInfo();
    onSpreadsheetLinked('', '');
    setStatusMessage({
      type: 'success',
      text: 'Tautan Google Sheet telah dilepas dari aplikasi ini.',
    });
  };

  const spreadsheetUrl = spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                Penyimpanan Google Sheets
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Simpan semua transaksi otomatis ke akun Google Anda
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {/* Status Message */}
          {statusMessage && (
            <div
              className={`p-3.5 rounded-2xl text-xs flex items-start gap-2.5 font-medium ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">{statusMessage.text}</div>
              <button
                type="button"
                onClick={() => setStatusMessage(null)}
                className="opacity-70 hover:opacity-100 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Section 1: Google Account Authentication */}
          {!user ? (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-white shadow-2xs border border-slate-200 mx-auto flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  Sambungkan Akun Google Anda
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Hubungkan akun Google Anda untuk membuat atau memperbarui spreadsheet pencatatan keuangan secara otomatis.
                </p>
              </div>

              {/* Official Google Sign-In button */}
              <div className="pt-2 flex justify-center">
                <button
                  type="button"
                  id="google-signin-btn"
                  onClick={onSignIn}
                  disabled={isLoggingIn}
                  className="flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs px-5 py-2.5 rounded-xl border border-slate-300 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  <svg className="w-4 h-4" viewBox="0 0 48 48">
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                  <span>{isLoggingIn ? 'Menghubungkan...' : 'Sign in with Google'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Google User'}
                    className="w-9 h-9 rounded-full border border-slate-200"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">
                    {user.email?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-800 truncate">
                    {user.displayName || 'Akun Google Terhubung'}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {user.email}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="text-xs text-slate-500 hover:text-rose-600 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 flex items-center gap-1 transition-colors cursor-pointer"
                title="Keluar dari akun Google"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Keluar</span>
              </button>
            </div>
          )}

          {/* Section 2: Spreadsheet Status & Management (Only when user is authenticated) */}
          {user && (
            <div className="space-y-4">
              {/* Linked Sheet Card */}
              {spreadsheetId ? (
                <div className="bg-white border border-emerald-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-800 truncate">
                            {spreadsheetName || 'Pembukuan Keuangan Telegram'}
                          </span>
                          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full shrink-0">
                            Aktif
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono truncate block">
                          ID: {spreadsheetId}
                        </span>
                      </div>
                    </div>

                    <a
                      href={spreadsheetUrl || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors shrink-0"
                    >
                      <span>Buka Sheet</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  {/* Sync Details */}
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
                    <div className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{transactions.length} transaksi terdata di aplikasi</span>
                    </div>
                    {lastSyncTime && (
                      <span className="text-[11px] text-slate-400">
                        Sinkron terakhir: {lastSyncTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                      </span>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowConfirmSync(true)}
                      disabled={isProcessing}
                      className="flex-1 min-w-[150px] px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                      <span>{isProcessing ? 'Menyinkronkan...' : 'Sinkronkan Sekarang'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDisconnectSheet}
                      className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-semibold transition-colors cursor-pointer"
                      title="Ganti ke Google Sheet lain"
                    >
                      Ganti Sheet
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Tab Selector */}
                  <div className="flex rounded-xl bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => setActiveSubTab('status')}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                        activeSubTab === 'status'
                          ? 'bg-white text-slate-800 shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Buat Sheet Otomatis
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSubTab('link_custom')}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                        activeSubTab === 'link_custom'
                          ? 'bg-white text-slate-800 shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Gunakan Sheet yang Ada
                    </button>
                  </div>

                  {/* Subtab 1: Auto create */}
                  {activeSubTab === 'status' && (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-center space-y-3">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                        <Plus className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">
                          Buat File Google Spreadsheet Otomatis
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                          Sistem akan langsung membuat file spreadsheet bernama <strong>"Pembukuan Keuangan Telegram"</strong> dengan kolom siap pakai di Google Drive Anda.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleCreateAutoSheet}
                        disabled={isProcessing}
                        className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        <span>{isProcessing ? 'Sedang Membuat...' : 'Buat & Hubungkan Sheet Baru'}</span>
                      </button>
                    </div>
                  )}

                  {/* Subtab 2: Link custom */}
                  {activeSubTab === 'link_custom' && (
                    <form
                      onSubmit={handleLinkExistingSheet}
                      className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3"
                    >
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                          Tautan (Link) atau ID Google Sheet
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0X.../edit"
                            value={customInput}
                            onChange={(e) => setCustomInput(e.target.value)}
                            required
                            className="w-full text-xs bg-white border border-slate-200 rounded-xl px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                          />
                          <Link2 className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5" />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">
                          Pastikan akun Google yang Anda login memiliki hak akses Edit ke Google Sheet tersebut.
                        </p>
                      </div>

                      <button
                        type="submit"
                        disabled={isProcessing || !customInput.trim()}
                        className="w-full px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" />
                        <span>{isProcessing ? 'Memverifikasi...' : 'Hubungkan Google Sheet Ini'}</span>
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* User Confirmation Dialog for Destructive Sync (Mandatory rule line 382) */}
              {showConfirmSync && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2.5 animate-in fade-in duration-150">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-900">
                        Konfirmasi Sinkronisasi Google Sheet
                      </h4>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        Tindakan ini akan memperbarui baris lembar <strong>"Transaksi"</strong> pada Google Sheet Anda dengan {transactions.length} transaksi saat ini. Lanjutkan?
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowConfirmSync(false)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-amber-100 transition-colors cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleExecuteSync}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-2xs transition-colors cursor-pointer"
                    >
                      Ya, Sinkronkan Sekarang
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Guide & Info footer */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-500 space-y-2">
            <div className="font-bold text-slate-700 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Format Kolom Otomatis:</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Setiap transaksi akan memuat <strong>ID Transaksi</strong>, <strong>Waktu (WIB)</strong>, <strong>Tipe (Pemasukan/Pengeluaran)</strong>, <strong>Kategori</strong>, <strong>Keterangan</strong>, <strong>Nominal</strong>, dan <strong>Teks Asli Chat</strong>.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Terhubung via Google Workspace API Resmi
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
