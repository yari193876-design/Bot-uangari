import { useState, useMemo } from 'react';
import {
  Search,
  Download,
  Plus,
  Trash2,
  Pencil,
  TrendingUp,
  TrendingDown,
  Wallet,
  Calendar,
  Layers,
  RefreshCw,
  FileSpreadsheet,
  Tag,
  Filter,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import { Transaction, DailySummary, TransactionType } from '../types';
import { formatRupiah, formatDateTime, getCategoryBadgeClass } from '../utils/formatters';
import EditTransactionModal from './EditTransactionModal';
import DeleteConfirmModal from './DeleteConfirmModal';

interface TransactionDatabaseProps {
  transactions: Transaction[];
  summary: DailySummary | null;
  isLoading: boolean;
  onRefresh: () => void;
  onDelete: (id: string) => Promise<void>;
  onEdit: (
    id: string,
    updatedTx: {
      type: TransactionType;
      amount: number;
      description: string;
      category: string;
      timestamp?: string;
    }
  ) => Promise<void>;
  onOpenManualModal: () => void;
  onOpenGuide: () => void;
  onOpenGoogleSheetsModal?: () => void;
  spreadsheetId?: string | null;
  spreadsheetName?: string;
  onSyncGoogleSheets?: () => void;
  isSyncingGoogleSheets?: boolean;
  hasGoogleAuth?: boolean;
  lastSyncTime?: Date | null;
}

export default function TransactionDatabase({
  transactions,
  summary,
  isLoading,
  onRefresh,
  onDelete,
  onEdit,
  onOpenManualModal,
  onOpenGuide,
  onOpenGoogleSheetsModal,
  spreadsheetId,
  spreadsheetName,
  onSyncGoogleSheets,
  isSyncingGoogleSheets = false,
  hasGoogleAuth = false,
  lastSyncTime = null,
}: TransactionDatabaseProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'pengeluaran' | 'pemasukan'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'all'>('all');

  // Modal states
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Extract unique sorted categories
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    transactions.forEach((t) => {
      if (t.category && t.category.trim()) {
        cats.add(t.category.trim());
      }
    });
    return Array.from(cats).sort((a, b) => a.localeCompare(b));
  }, [transactions]);

  // Filter list
  const filtered = transactions.filter((t) => {
    // Type filter
    if (typeFilter !== 'all' && t.type !== typeFilter) return false;

    // Category filter
    if (categoryFilter !== 'all' && t.category.toLowerCase() !== categoryFilter.toLowerCase()) {
      return false;
    }

    // Date filter
    if (dateFilter === 'today') {
      const today = new Date().toDateString();
      if (new Date(t.timestamp).toDateString() !== today) return false;
    } else if (dateFilter === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 6);
      weekAgo.setHours(0, 0, 0, 0);
      if (new Date(t.timestamp) < weekAgo) return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchDesc = t.description.toLowerCase().includes(q);
      const matchCat = t.category.toLowerCase().includes(q);
      const matchAmt = t.amount.toString().includes(q);
      if (!matchDesc && !matchCat && !matchAmt) return false;
    }

    return true;
  });

  const handleConfirmDelete = async () => {
    if (!deletingTx) return;
    try {
      setIsDeleting(true);
      await onDelete(deletingTx.id);
      setDeletingTx(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportCsv = () => {
    window.location.href = '/api/export/csv';
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Bento Card Header */}
      <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100/80 flex items-center justify-center text-indigo-600 shadow-2xs">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-900 text-base leading-snug">
                Database & Google Sheets Sync
              </h2>
              {hasGoogleAuth ? (
                <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Google Sheet Terhubung</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={onSyncGoogleSheets}
                  className="text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full hover:bg-amber-100 transition-colors cursor-pointer"
                  title="Klik untuk menghubungkan akun Google agar otomatis sinkron ke Spreadsheet"
                >
                  ⚠️ Login Google untuk Sinkron
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {lastSyncTime
                ? `Terakhir disinkronkan ke sheet: ${lastSyncTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} WIB`
                : 'Tersimpan otomatis di database sistem'}
            </p>
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
          {spreadsheetId ? (
            <div className="flex items-center gap-1.5">
              <a
                href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`}
                target="_blank"
                rel="noreferrer"
                id="open-live-gsheet-btn"
                title={`Buka Google Sheet: ${spreadsheetName || 'Pembukuan Keuangan Telegram'}`}
                className="px-3.5 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span className="max-w-[130px] truncate hidden sm:inline">
                  {spreadsheetName || 'Buka Sheet'}
                </span>
                <span className="sm:hidden">Sheet</span>
                <ExternalLink className="w-3 h-3 text-emerald-200" />
              </a>

              {onSyncGoogleSheets && (
                <button
                  type="button"
                  id="sync-gsheet-now-btn"
                  onClick={onSyncGoogleSheets}
                  disabled={isSyncingGoogleSheets}
                  title="Sinkronkan transaksi sekarang ke Google Sheet"
                  className="px-3 py-2 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingGoogleSheets ? 'animate-spin' : ''}`} />
                  <span className="hidden md:inline">Sinkronkan</span>
                </button>
              )}
            </div>
          ) : (
            onOpenGoogleSheetsModal && (
              <button
                type="button"
                id="connect-gsheet-btn"
                onClick={onOpenGoogleSheetsModal}
                title="Hubungkan Google Sheet untuk menyimpan semua transaksi secara otomatis"
                className="px-3.5 py-2 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Simpan di Google Sheet</span>
              </button>
            )
          )}

          <button
            type="button"
            id="export-csv-btn"
            onClick={handleExportCsv}
            title="Download CSV untuk Google Sheets / Excel offline"
            className="px-3.5 py-2 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Unduh CSV</span>
          </button>

          <button
            type="button"
            id="open-manual-tx-btn"
            onClick={onOpenManualModal}
            className="px-3.5 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Manual</span>
          </button>

          <button
            type="button"
            id="refresh-database-btn"
            onClick={onRefresh}
            title="Segarkan Data"
            className="p-2 rounded-2xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Toolbar: Search, Filters, & Counts */}
      <div className="px-4 sm:px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Left: Search & Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Bar */}
          <div className="relative min-w-[180px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              id="search-transactions-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari transaksi..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-2xl text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>

          {/* Type Filter Buttons */}
          <div className="flex items-center bg-slate-200/70 p-0.5 rounded-2xl border border-slate-200 text-xs">
            <button
              type="button"
              id="filter-type-all"
              onClick={() => setTypeFilter('all')}
              className={`px-2.5 py-1 rounded-xl font-medium transition-all cursor-pointer ${
                typeFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua
            </button>
            <button
              type="button"
              id="filter-type-pengeluaran"
              onClick={() => setTypeFilter('pengeluaran')}
              className={`px-2.5 py-1 rounded-xl font-medium transition-all cursor-pointer ${
                typeFilter === 'pengeluaran'
                  ? 'bg-rose-500 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🔴 Keluar
            </button>
            <button
              type="button"
              id="filter-type-pemasukan"
              onClick={() => setTypeFilter('pemasukan')}
              className={`px-2.5 py-1 rounded-xl font-medium transition-all cursor-pointer ${
                typeFilter === 'pemasukan'
                  ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🟢 Masuk
            </button>
          </div>

          {/* Category Filter */}
          <div className="flex items-center bg-white border border-slate-200 rounded-2xl px-2.5 py-1 text-xs text-slate-700 shadow-2xs">
            <Tag className="w-3.5 h-3.5 text-indigo-500 mr-1.5 shrink-0" />
            <select
              id="filter-category-select"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-transparent text-xs text-slate-700 font-medium focus:outline-hidden cursor-pointer pr-1"
            >
              <option value="all">Semua Kategori ({availableCategories.length})</option>
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Date Filter */}
          <select
            id="filter-date-select"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as any)}
            className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-2xl text-slate-700 font-medium focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer shadow-2xs"
          >
            <option value="all">Semua Waktu</option>
            <option value="today">Hari Ini Saja</option>
            <option value="week">7 Hari Terakhir</option>
          </select>

          {/* Clear Filters Button (if filtered) */}
          {(categoryFilter !== 'all' || typeFilter !== 'all' || dateFilter !== 'all' || searchQuery) && (
            <button
              type="button"
              id="reset-filters-btn"
              onClick={() => {
                setTypeFilter('all');
                setCategoryFilter('all');
                setDateFilter('all');
                setSearchQuery('');
              }}
              className="text-[11px] text-slate-500 hover:text-slate-800 underline px-1 cursor-pointer"
            >
              Reset Filter
            </button>
          )}
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Total: <strong className="text-slate-800">{filtered.length}</strong> transaksi
        </div>
      </div>

      {/* Spreadsheet / Database Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50/90 sticky top-0 z-10 text-[10px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-200/80 backdrop-blur-xs">
            <tr>
              <th className="py-3 px-4">Waktu</th>
              <th className="py-3 px-3">Tipe</th>
              <th className="py-3 px-3">Kategori</th>
              <th className="py-3 px-4">Keterangan</th>
              <th className="py-3 px-4 text-right">Nominal (IDR)</th>
              <th className="py-3 px-3 text-center">Aksi</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-14 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-1">
                      <Layers className="w-6 h-6 stroke-[1.5]" />
                    </div>
                    {transactions.length === 0 ? (
                      <>
                        <p className="font-semibold text-slate-700 text-sm">Belum Ada Transaksi (Rp 0)</p>
                        <p className="text-xs text-slate-400 max-w-sm">
                          Database bersih dan siap digunakan. Mulai catat transaksi pertamamu lewat chat Telegram atau tombol <strong>Tambah Manual</strong> di atas.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-slate-600">Tidak ada transaksi yang cocok</p>
                        <p className="text-[11px] text-slate-400 max-w-sm">
                          Coba ubah pilihan filter kategori, tipe, atau klik Reset Filter untuk melihat semua transaksi.
                        </p>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((t) => {
                const isPengeluaran = t.type === 'pengeluaran';
                return (
                  <tr
                    key={t.id}
                    className="hover:bg-slate-50/80 transition-colors group"
                  >
                    {/* Waktu */}
                    <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap text-[11px] font-medium">
                      {formatDateTime(t.timestamp)}
                    </td>

                    {/* Tipe Badge */}
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      {isPengeluaran ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200/80">
                          🔴 Pengeluaran
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                          🟢 Pemasukan
                        </span>
                      )}
                    </td>

                    {/* Kategori */}
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setCategoryFilter(t.category)}
                        title={`Filter hanya kategori ${t.category}`}
                        className={`inline-block px-2.5 py-0.5 rounded-lg text-[11px] font-semibold border hover:opacity-85 transition-opacity cursor-pointer ${getCategoryBadgeClass(
                          t.category,
                          t.type
                        )}`}
                      >
                        {t.category}
                      </button>
                    </td>

                    {/* Keterangan */}
                    <td className="py-3.5 px-4 font-semibold text-slate-900 max-w-[240px] truncate" title={t.description}>
                      {t.description}
                      {t.rawMessage && (
                        <span className="block text-[10px] text-slate-400 font-normal italic truncate mt-0.5">
                          "{t.rawMessage}"
                        </span>
                      )}
                    </td>

                    {/* Nominal */}
                    <td
                      className={`py-3.5 px-4 text-right font-mono font-bold whitespace-nowrap text-sm ${
                        isPengeluaran ? 'text-rose-600' : 'text-emerald-600'
                      }`}
                    >
                      {isPengeluaran ? '-' : '+'} {formatRupiah(t.amount)}
                    </td>

                    {/* Aksi: Edit & Hapus */}
                    <td className="py-3.5 px-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          id={`edit-tx-${t.id}`}
                          onClick={() => setEditingTx(t)}
                          title="Edit transaksi"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          id={`delete-tx-${t.id}`}
                          onClick={() => setDeletingTx(t)}
                          title="Hapus transaksi"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Info */}
      <div className="px-5 py-3 bg-white border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <div>
          Menampilkan <strong className="text-slate-800">{filtered.length}</strong> dari{' '}
          <strong className="text-slate-800">{transactions.length}</strong> entri
        </div>
        <button
          type="button"
          onClick={onOpenGuide}
          className="text-indigo-600 hover:text-indigo-700 font-semibold text-xs flex items-center gap-1 cursor-pointer"
        >
          <span>Panduan format & Sheets ↗</span>
        </button>
      </div>

      {/* Edit Transaction Modal */}
      <EditTransactionModal
        isOpen={Boolean(editingTx)}
        transaction={editingTx}
        onClose={() => setEditingTx(null)}
        onSave={async (id, updated) => {
          await onEdit(id, updated);
        }}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={Boolean(deletingTx)}
        transaction={deletingTx}
        onClose={() => setDeletingTx(null)}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />
    </div>
  );
}

