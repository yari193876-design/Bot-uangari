import { useState, useEffect, type FormEvent } from 'react';
import { X, Pencil, ArrowUpRight, ArrowDownLeft, Calendar } from 'lucide-react';
import { Transaction, TransactionType } from '../types';

interface EditTransactionModalProps {
  isOpen: boolean;
  transaction: Transaction | null;
  onClose: () => void;
  onSave: (id: string, updated: {
    type: TransactionType;
    amount: number;
    description: string;
    category: string;
    timestamp?: string;
  }) => Promise<void>;
}

const CATEGORIES_PENGELUARAN = [
  'Makanan & Minuman',
  'Transportasi',
  'Belanja',
  'Tagihan & Utilitas',
  'Kesehatan',
  'Hiburan',
  'Kebutuhan Harian',
  'Lainnya',
];

const CATEGORIES_PEMASUKAN = [
  'Gaji & Upah',
  'Penjualan & Bisnis',
  'Bonus & Hadiah',
  'Pekerjaan Sampingan',
  'Investasi',
  'Pendapatan Lainnya',
];

export default function EditTransactionModal({
  isOpen,
  transaction,
  onClose,
  onSave,
}: EditTransactionModalProps) {
  const [type, setType] = useState<TransactionType>('pengeluaran');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [datetime, setDatetime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Sync state when selected transaction changes
  useEffect(() => {
    if (transaction) {
      setType(transaction.type);
      setAmount(transaction.amount.toString());
      setDescription(transaction.description);
      setCategory(transaction.category);
      
      // Format timestamp for datetime-local input (YYYY-MM-DDTHH:mm)
      try {
        const d = new Date(transaction.timestamp);
        const pad = (n: number) => n.toString().padStart(2, '0');
        const localIso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        setDatetime(localIso);
      } catch {
        setDatetime('');
      }
      setError('');
    }
  }, [transaction]);

  if (!isOpen || !transaction) return null;

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    const defaults = newType === 'pengeluaran' ? CATEGORIES_PENGELUARAN : CATEGORIES_PEMASUKAN;
    if (!defaults.includes(category)) {
      setCategory(defaults[0]);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const numericAmount = parseInt(amount.replace(/[^\d]/g, ''), 10);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setError('Nominal harus berupa angka lebih dari 0');
      return;
    }

    if (!description.trim()) {
      setError('Keterangan transaksi harus diisi');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSave(transaction.id, {
        type,
        amount: numericAmount,
        description: description.trim(),
        category: category.trim() || (type === 'pengeluaran' ? 'Makanan & Minuman' : 'Pendapatan Lainnya'),
        timestamp: datetime ? new Date(datetime).toISOString() : transaction.timestamp,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Gagal menyimpan perubahan transaksi');
    } finally {
      setIsSubmitting(false);
    }
  };

  const categoryList = type === 'pengeluaran' ? CATEGORIES_PENGELUARAN : CATEGORIES_PEMASUKAN;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <Pencil className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base leading-tight">Edit Transaksi</h3>
              <p className="text-[11px] text-slate-400">ID: {transaction.id}</p>
            </div>
          </div>
          <button
            id="close-edit-modal-btn"
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs font-semibold rounded-2xl bg-rose-50 text-rose-700 border border-rose-200">
              {error}
            </div>
          )}

          {/* Type Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              Jenis Transaksi
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                id="edit-select-type-pengeluaran"
                onClick={() => handleTypeChange('pengeluaran')}
                className={`py-2.5 px-3 rounded-2xl border font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  type === 'pengeluaran'
                    ? 'bg-rose-50 border-rose-300 text-rose-700 shadow-2xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ArrowDownLeft className="w-4 h-4 text-rose-600" />
                <span>🔴 Pengeluaran</span>
              </button>
              <button
                type="button"
                id="edit-select-type-pemasukan"
                onClick={() => handleTypeChange('pemasukan')}
                className={`py-2.5 px-3 rounded-2xl border font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  type === 'pemasukan'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-2xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                <span>🟢 Pemasukan</span>
              </button>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
              Nominal (Rp)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-xs text-slate-400">
                Rp
              </span>
              <input
                type="text"
                id="edit-tx-amount-input"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="25000"
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-2xl text-slate-900 font-semibold placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                required
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
              Keterangan
            </label>
            <input
              type="text"
              id="edit-tx-desc-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Contoh: Makan siang, Bensin, Gaji bulanan"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
              required
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
              Kategori
            </label>
            <select
              id="edit-tx-category-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-200 rounded-2xl text-slate-800 font-medium focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all cursor-pointer"
            >
              {categoryList.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
              {!categoryList.includes(category) && category && (
                <option value={category}>{category}</option>
              )}
            </select>
          </div>

          {/* Date & Time */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
              Waktu Transaksi
            </label>
            <div className="relative">
              <input
                type="datetime-local"
                id="edit-tx-datetime-input"
                value={datetime}
                onChange={(e) => setDatetime(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-200 rounded-2xl text-slate-800 font-medium focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all cursor-pointer"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              id="submit-edit-tx-btn"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Simpan Perubahan</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
