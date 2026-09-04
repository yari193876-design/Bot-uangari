import { X, Trash2, AlertTriangle } from 'lucide-react';
import { Transaction } from '../types';
import { formatRupiah, formatDateTime } from '../utils/formatters';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  transaction: Transaction | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
}

export default function DeleteConfirmModal({
  isOpen,
  transaction,
  onClose,
  onConfirm,
  isDeleting,
}: DeleteConfirmModalProps) {
  if (!isOpen || !transaction) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 mx-auto flex items-center justify-center mb-4 shadow-xs">
            <Trash2 className="w-6 h-6" />
          </div>

          <h3 className="font-bold text-slate-900 text-base mb-1">
            Hapus Transaksi?
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            Transaksi ini akan dihapus permanen dari pembukuan dan rekapan keuangan.
          </p>

          {/* Transaction Preview Card */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 text-left mb-6 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Keterangan:</span>
              <span className="font-bold text-slate-800 truncate max-w-[170px]" title={transaction.description}>
                {transaction.description}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Nominal:</span>
              <span className={`font-mono font-bold ${transaction.type === 'pengeluaran' ? 'text-rose-600' : 'text-emerald-600'}`}>
                {transaction.type === 'pengeluaran' ? '-' : '+'} {formatRupiah(transaction.amount)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Kategori:</span>
              <span className="text-slate-700 font-medium">{transaction.category}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Waktu:</span>
              <span className="text-slate-500">{formatDateTime(transaction.timestamp)}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="flex-1 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              id="confirm-delete-tx-btn"
              onClick={onConfirm}
              disabled={isDeleting}
              className="flex-1 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {isDeleting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Menghapus...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Ya, Hapus</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
