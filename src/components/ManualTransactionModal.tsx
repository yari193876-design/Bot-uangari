import { useState, type FormEvent } from 'react';
import { X, PlusCircle, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { TransactionType } from '../types';

interface ManualTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (tx: {
    type: TransactionType;
    amount: number;
    description: string;
    category: string;
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

export default function ManualTransactionModal({
  isOpen,
  onClose,
  onAdd,
}: ManualTransactionModalProps) {
  const [type, setType] = useState<TransactionType>('pengeluaran');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Makanan & Minuman');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    setCategory(newType === 'pengeluaran' ? CATEGORIES_PENGELUARAN[0] : CATEGORIES_PEMASUKAN[0]);
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
      await onAdd({
        type,
        amount: numericAmount,
        description: description.trim(),
        category,
      });
      // Reset
      setAmount('');
      setDescription('');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Gagal menambahkan transaksi');
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
            <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <PlusCircle className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">Tambah Transaksi Manual</h3>
          </div>
          <button
            id="close-manual-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-sm rounded-2xl bg-red-50 text-red-700 border border-red-200">
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
                id="select-type-pengeluaran"
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
                id="select-type-pemasukan"
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

          {/* Nominal */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              Nominal (Rp)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                Rp
              </span>
              <input
                type="text"
                id="manual-amount-input"
                placeholder="25.000"
                value={amount}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^\d]/g, '');
                  if (!val) {
                    setAmount('');
                  } else {
                    setAmount(parseInt(val, 10).toLocaleString('id-ID'));
                  }
                }}
                className="w-full pl-12 pr-4 py-2.5 rounded-2xl border border-slate-200 text-slate-900 font-bold focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-base"
                required
              />
            </div>
          </div>

          {/* Keterangan */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              Keterangan
            </label>
            <input
              type="text"
              id="manual-description-input"
              placeholder="Contoh: Beli makan siang nasi padang"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 text-slate-800 placeholder-slate-400 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              required
            />
          </div>

          {/* Kategori */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
              Kategori
            </label>
            <select
              id="manual-category-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 text-slate-800 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
            >
              {categoryList.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Buttons */}
          <div className="pt-3 flex items-center justify-end gap-2.5">
            <button
              type="button"
              id="cancel-manual-btn"
              onClick={onClose}
              className="px-4 py-2.5 rounded-2xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              id="submit-manual-btn"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Menyimpan...' : 'Simpan Transaksi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
