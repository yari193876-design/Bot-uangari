import { useState } from 'react';
import {
  X,
  BookOpen,
  Send,
  FileSpreadsheet,
  Bot,
  Check,
  Copy,
  ExternalLink,
  Zap,
  ShieldCheck,
  Server,
  RefreshCw,
  Globe,
  Clock,
  Activity,
  Terminal,
} from 'lucide-react';
import { TelegramBotStatus } from '../types';

interface TelegramBotGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  botStatus?: TelegramBotStatus | null;
  initialTab?: 'format' | 'always_on' | 'sheets' | 'status';
}

export default function TelegramBotGuideModal({
  isOpen,
  onClose,
  botStatus,
  initialTab = 'always_on',
}: TelegramBotGuideModalProps) {
  const [activeTab, setActiveTab] = useState<'format' | 'always_on' | 'sheets' | 'status'>(initialTab);
  const [copied, setCopied] = useState<string | null>(null);
  const [customWebhookUrl, setCustomWebhookUrl] = useState('');
  const [isSubmittingWebhook, setIsSubmittingWebhook] = useState(false);
  const [webhookMessage, setWebhookMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const botUsername = botStatus?.botInfo?.username || 'Hahaha_uangbot';
  const botFirstName = botStatus?.botInfo?.first_name || 'Hahahha';
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const currentWebhookUrl = `${currentOrigin}/api/telegram-webhook`;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleSetWebhook = async () => {
    const url = customWebhookUrl.trim() || currentWebhookUrl;
    if (!url.startsWith('https://')) {
      setWebhookMessage('Error: URL Webhook harus diawali dengan https://');
      return;
    }

    setIsSubmittingWebhook(true);
    setWebhookMessage(null);
    try {
      const res = await fetch('/api/telegram/webhook/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setWebhookMessage(`✅ Webhook berhasil diaktifkan ke: ${url}`);
      } else {
        setWebhookMessage(`❌ Gagal: ${data.error || 'Terjadi kesalahan'}`);
      }
    } catch (e: any) {
      setWebhookMessage(`❌ Gagal: ${e?.message || 'Koneksi error'}`);
    } finally {
      setIsSubmittingWebhook(false);
    }
  };

  const handleDeleteWebhook = async () => {
    setIsSubmittingWebhook(true);
    setWebhookMessage(null);
    try {
      const res = await fetch('/api/telegram/webhook/delete', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.ok) {
        setWebhookMessage('✅ Webhook dicopot. Bot beralih kembali ke Long Polling 24/7.');
      } else {
        setWebhookMessage(`❌ Gagal: ${data.error || 'Terjadi kesalahan'}`);
      }
    } catch (e: any) {
      setWebhookMessage(`❌ Gagal: ${e?.message || 'Koneksi error'}`);
    } finally {
      setIsSubmittingWebhook(false);
    }
  };

  const formatUptime = (seconds?: number) => {
    if (!seconds && seconds !== 0) return '-';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs} jam ${mins} mnt ${secs} dtk`;
    if (mins > 0) return `${mins} mnt ${secs} dtk`;
    return `${secs} detik`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-2xs">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-base">Pusat Kendali Bot Telegram & Panduan</h3>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  24/7 Watchdog
                </span>
              </div>
              <p className="text-xs text-slate-500">Koneksi Telegram, petunjuk aktif 24 jam nonstop, & format pencatatan</p>
            </div>
          </div>
          <button
            id="close-guide-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            id="tab-always-on"
            onClick={() => setActiveTab('always_on')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'always_on'
                ? 'border-indigo-600 text-indigo-600 bg-white shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>Aktif 24 Jam Nonstop</span>
          </button>

          <button
            type="button"
            id="tab-format"
            onClick={() => setActiveTab('format')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'format'
                ? 'border-indigo-600 text-indigo-600 bg-white shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Format Chat & Rekap</span>
          </button>

          <button
            type="button"
            id="tab-status"
            onClick={() => setActiveTab('status')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'status'
                ? 'border-indigo-600 text-indigo-600 bg-white shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Status Real-time</span>
          </button>

          <button
            type="button"
            id="tab-sheets"
            onClick={() => setActiveTab('sheets')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'sheets'
                ? 'border-indigo-600 text-indigo-600 bg-white shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Google Sheets</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-700 leading-relaxed">
          {/* TAB 1: AKTIF 24 JAM NONSTOP */}
          {activeTab === 'always_on' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Status Banner */}
              <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex items-start gap-3.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-emerald-950 text-sm">Bot Aktif & Diawasi Watchdog Supervisor</span>
                    <span className="text-[10px] bg-emerald-200/80 text-emerald-900 font-bold px-2 py-0.5 rounded-full">
                      Auto-Revive ON
                    </span>
                  </div>
                  <p className="text-xs text-emerald-900 leading-relaxed">
                    Sistem server bot sudah dilengkapi <strong>Watchdog Supervisor 24 Jam</strong> yang secara otomatis mendeteksi jika koneksi terputus dan menghidupkan kembali (*auto-revive*) proses penerima pesan tanpa henti.
                  </p>
                </div>
              </div>

              {/* Bot Link Quick Launch */}
              <div className="p-4 bg-sky-50 border border-sky-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      Akun Bot Telegram: <span className="text-sky-700">@{botUsername}</span> ({botFirstName})
                    </span>
                    <span className="text-[11px] text-slate-500">Kirim pesan kapan saja dari HP atau Laptop</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={`https://t.me/${botUsername}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Buka di Telegram</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`https://t.me/${botUsername}`, 'tg-link-24')}
                    className="px-3 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-medium flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                  >
                    {copied === 'tg-link-24' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied === 'tg-link-24' ? 'Tersalin' : 'Salin'}</span>
                  </button>
                </div>
              </div>

              {/* 3 Panduan Cara Menjaga Bot Online 24 Jam */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm uppercase tracking-wider">
                  <Server className="w-4 h-4" />
                  <h4>3 Pilihan Agar Bot Berjalan 24 Jam Nonstop:</h4>
                </div>

                <div className="space-y-3">
                  {/* Opsi 1 */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">1</span>
                        Deploy ke Cloud Run (Resmi via Google AI Studio)
                      </span>
                      <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-md">
                        Rekomendasi
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      Klik tombol <strong>Deploy</strong> di pojok kanan atas aplikasi AI Studio ini untuk meluncurkan ke Google Cloud Run. Server kamu akan otomatis dihosting di infrastruktur Google Cloud dan siap melayani chat kapan saja tanpa perlu laptop kamu menyala!
                    </p>
                  </div>

                  {/* Opsi 2 */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">2</span>
                        Self-Hosted VPS / Cloud Server Pribadi (PM2 / Docker)
                      </span>
                      <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded-md">
                        Mandiri & 100% Bebas Biaya Idle
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      Kamu bisa meng-export source code ini ke GitHub / ZIP melalui menu <strong>Settings</strong>, lalu jalankan di VPS kamu (Ubuntu/Debian) dengan perintah:
                    </p>
                    <div className="p-3 bg-slate-900 text-slate-100 rounded-xl text-[11px] font-mono relative">
                      <code>
                        npm install && npm run build<br />
                        npm install -g pm2<br />
                        pm2 start dist/server.cjs --name bot-keuangan<br />
                        pm2 save && pm2 startup
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('npm install && npm run build && pm2 start dist/server.cjs --name bot-keuangan && pm2 save', 'pm2cmd')}
                        className="absolute top-2 right-2 p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 cursor-pointer"
                        title="Salin Perintah"
                      >
                        {copied === 'pm2cmd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      PM2 akan menjaga bot hidup 24 jam nonstop dan otomatis restart jika server melakukan reboot.
                    </p>
                  </div>

                  {/* Opsi 3 */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">3</span>
                        Uptime Keep-Alive Ping Gratis (Mencegah Mode Tidur)
                      </span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md">
                        Gratis
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      Daftar gratis di layanan seperti <a href="https://uptimerobot.com" target="_blank" rel="noreferrer" className="text-blue-600 font-semibold underline">UptimeRobot</a> atau <a href="https://cron-job.org" target="_blank" rel="noreferrer" className="text-blue-600 font-semibold underline">Cron-job.org</a>, lalu masukkan URL health-check kamu:
                    </p>
                    <div className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200">
                      <code className="text-[11px] text-slate-800 flex-1 truncate font-mono">
                        {currentOrigin}/api/health
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(`${currentOrigin}/api/health`, 'healthurl')}
                        className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium cursor-pointer"
                      >
                        {copied === 'healthurl' ? 'Tersalin!' : 'Salin URL'}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Set interval ping setiap 5 menit agar server cloud kamu selalu terjaga (*stay awake*) 24/7.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: FORMAT CHAT & REKAP */}
          {activeTab === 'format' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm uppercase tracking-wider">
                  <Send className="w-4 h-4" />
                  <h4>Format Input Pesan yang Didukung</h4>
                </div>
                <p className="text-slate-600 text-xs">
                  Bot memahami bahasa santai sehari-hari maupun format kilat singkatan:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-4 bg-rose-50/70 border border-rose-100 rounded-2xl space-y-2">
                    <span className="text-xs font-bold text-rose-700 uppercase tracking-wider block">
                      🔴 Pengeluaran
                    </span>
                    <ul className="text-xs text-slate-700 space-y-1.5">
                      <li>• <code className="bg-white px-2 py-0.5 rounded-md border border-rose-200 font-semibold text-rose-800">K 20000 makan</code> (Kilat)</li>
                      <li>• <code className="bg-white px-2 py-0.5 rounded-md border border-rose-200 text-slate-800">habis beli makan 20rb</code></li>
                      <li>• <code className="bg-white px-2 py-0.5 rounded-md border border-rose-200 text-slate-800">beli bensin motor 35k</code></li>
                      <li>• <code className="bg-white px-2 py-0.5 rounded-md border border-rose-200 text-slate-800">bayar wifi 350.000</code></li>
                    </ul>
                  </div>

                  <div className="p-4 bg-emerald-50/70 border border-emerald-100 rounded-2xl space-y-2">
                    <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider block">
                      🟢 Pemasukan
                    </span>
                    <ul className="text-xs text-slate-700 space-y-1.5">
                      <li>• <code className="bg-white px-2 py-0.5 rounded-md border border-emerald-200 font-semibold text-emerald-800">M 500000 freelance</code> (Kilat)</li>
                      <li>• <code className="bg-white px-2 py-0.5 rounded-md border border-emerald-200 text-slate-800">dapet transferan 150rb</code></li>
                      <li>• <code className="bg-white px-2 py-0.5 rounded-md border border-emerald-200 text-slate-800">gaji bulanan 5.5jt</code></li>
                      <li>• <code className="bg-white px-2 py-0.5 rounded-md border border-emerald-200 text-slate-800">jual baju second 75k</code></li>
                    </ul>
                  </div>
                </div>

                {/* EDIT TRANSAKSI VIA CHAT */}
                <div className="p-4 bg-indigo-50/80 border border-indigo-200 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                      <span>✏️</span> Perintah Edit / Revisi Transaksi via Chat
                    </span>
                    <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-md">
                      Fitur Baru
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    Salah memasukkan nominal atau keterangan saat chat di Telegram? Kamu bisa langsung merevisinya kapan saja tanpa buka dashboard:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 bg-white rounded-xl border border-indigo-100 space-y-1">
                      <span className="font-semibold text-slate-900 block text-[11px]">Ubah Transaksi Terakhir:</span>
                      <code className="text-[11px] text-indigo-700 font-mono block bg-slate-50 px-2 py-1 rounded">
                        EDIT TERAKHIR 30rb rokok dan kopi
                      </code>
                      <span className="text-[10px] text-slate-500 block">Mengganti nominal dan keterangan transaksi terakhir.</span>
                    </div>

                    <div className="p-2.5 bg-white rounded-xl border border-indigo-100 space-y-1">
                      <span className="font-semibold text-slate-900 block text-[11px]">Hanya Ubah Nominal:</span>
                      <code className="text-[11px] text-indigo-700 font-mono block bg-slate-50 px-2 py-1 rounded">
                        EDIT TERAKHIR 35000
                      </code>
                      <span className="text-[10px] text-slate-500 block">Nominal berubah jadi 35.000, keterangan tetap sama.</span>
                    </div>

                    <div className="p-2.5 bg-white rounded-xl border border-indigo-100 space-y-1">
                      <span className="font-semibold text-slate-900 block text-[11px]">Hanya Ubah Keterangan:</span>
                      <code className="text-[11px] text-indigo-700 font-mono block bg-slate-50 px-2 py-1 rounded">
                        EDIT TERAKHIR KET rokok surya 16
                      </code>
                      <span className="text-[10px] text-slate-500 block">Keterangan diperbarui, nominal tidak berubah.</span>
                    </div>

                    <div className="p-2.5 bg-white rounded-xl border border-indigo-100 space-y-1">
                      <span className="font-semibold text-slate-900 block text-[11px]">Cek Transaksi Terakhir & Panduan:</span>
                      <code className="text-[11px] text-indigo-700 font-mono block bg-slate-50 px-2 py-1 rounded">
                        EDIT
                      </code>
                      <span className="text-[10px] text-slate-500 block">Bot akan menampilkan detail transaksi terakhir & opsi edit.</span>
                    </div>
                  </div>
                </div>

                {/* REKAP MINGGUAN & HARIAN */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-4 bg-sky-50/80 border border-sky-200 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-sky-900 uppercase tracking-wider block">
                        📈 Rekap Mingguan (7 Hari)
                      </span>
                      <span className="text-[10px] bg-sky-100 text-sky-800 font-bold px-2 py-0.5 rounded-md">
                        Fitur Baru
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      Ketik <code className="bg-white px-2 py-0.5 rounded-md border border-sky-200 font-bold text-sky-800">REKAP MINGGUAN</code> atau <em>"rekap minggu ini"</em> di chat Telegram.
                    </p>
                    <p className="text-[11px] text-slate-600">
                      Menghasilkan laporan komprehensif: total masuk & keluar 7 hari terakhir, rata-rata belanja harian, persentase kategori, dan saldo kas total.
                    </p>
                  </div>

                  <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-2">
                    <span className="text-xs font-bold text-amber-900 uppercase tracking-wider block">
                      📊 Rekap Harian & Cek Saldo
                    </span>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      Ketik <code className="bg-white px-2 py-0.5 rounded-md border border-amber-200 font-bold text-amber-900">REKAP</code> atau tanyakan <em>"cek saldo"</em> / <em>"sisa uang hari ini"</em>.
                    </p>
                    <p className="text-[11px] text-slate-600">
                      Menghitung total pengeluaran hari ini, pemasukan, sisa saldo harian, dan 5 rincian transaksi terbaru hari ini.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: STATUS REAL-TIME */}
          {activeTab === 'status' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                  <span className="text-[11px] font-semibold text-slate-400 block uppercase">Status Bot</span>
                  <span className="text-sm font-bold text-emerald-600 flex items-center gap-1 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    {botStatus?.connected ? 'Terkoneksi' : 'Menghubungkan'}
                  </span>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                  <span className="text-[11px] font-semibold text-slate-400 block uppercase">Mode Aktif</span>
                  <span className="text-sm font-bold text-slate-800 mt-0.5 block">
                    {botStatus?.isWebhookMode ? 'Webhook' : 'Long Polling 24/7'}
                  </span>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                  <span className="text-[11px] font-semibold text-slate-400 block uppercase">Uptime Server</span>
                  <span className="text-sm font-bold text-slate-800 mt-0.5 block">
                    {formatUptime(botStatus?.uptimeSeconds)}
                  </span>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                  <span className="text-[11px] font-semibold text-slate-400 block uppercase">Pesan Diproses</span>
                  <span className="text-sm font-bold text-indigo-600 mt-0.5 block">
                    {botStatus?.processedUpdatesCount || 0} pesan
                  </span>
                </div>
              </div>

              {/* Watchdog Metrics Card */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">Watchdog Supervisor Status:</span>
                  <span className="text-emerald-700 font-semibold">Aktif Memantau</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600">
                  <div>• Auto-Revive Terpicu: <strong>{botStatus?.watchdogRestartCount || 0} kali</strong></div>
                  <div>• Keep-Alive Internal Ping: <strong>{botStatus?.keepAliveCount || 0} kali</strong></div>
                  <div>• Polling Terakhir: <strong>{botStatus?.lastPolledAt ? new Date(botStatus.lastPolledAt).toLocaleTimeString('id-ID') : '-'}</strong></div>
                  <div>• Server Mulai: <strong>{botStatus?.serverStartedAt ? new Date(botStatus.serverStartedAt).toLocaleTimeString('id-ID') : '-'}</strong></div>
                </div>
              </div>

              {/* Webhook Configuration (Opsional) */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Pengaturan Webhook Alternatif (Opsional):</span>
                  {botStatus?.isWebhookMode && (
                    <span className="text-[10px] bg-sky-100 text-sky-800 font-bold px-2 py-0.5 rounded-md">
                      Mode Webhook Aktif
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  Jika kamu memiliki domain HTTPS publik permanen, kamu dapat mengarahkan Webhook Telegram langsung ke endpoint:
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customWebhookUrl}
                    onChange={(e) => setCustomWebhookUrl(e.target.value)}
                    placeholder={currentWebhookUrl}
                    className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-indigo-500 font-mono"
                  />
                  <button
                    type="button"
                    disabled={isSubmittingWebhook}
                    onClick={handleSetWebhook}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-medium cursor-pointer"
                  >
                    Pasang
                  </button>
                  {botStatus?.isWebhookMode && (
                    <button
                      type="button"
                      disabled={isSubmittingWebhook}
                      onClick={handleDeleteWebhook}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-medium cursor-pointer"
                    >
                      Lepas Webhook
                    </button>
                  )}
                </div>
                {webhookMessage && (
                  <p className="text-xs font-medium mt-1 text-slate-700">{webhookMessage}</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: GOOGLE SHEETS */}
          {activeTab === 'sheets' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm uppercase tracking-wider">
                  <FileSpreadsheet className="w-4 h-4" />
                  <h4>Simpan & Sinkronisasi Langsung ke Google Sheets</h4>
                </div>
                <p className="text-slate-600 text-xs">
                  Aplikasi ini kini terintegrasi langsung dengan <strong>Google Sheets API</strong>! Semua data transaksi keuangan Anda dapat disimpan secara cloud dan otomatis ke spreadsheet akun Google Anda:
                </p>

                <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl text-xs space-y-3">
                  <span className="font-bold text-emerald-900 block">✨ Cara Menggunakan Google Sheets Terintegrasi:</span>
                  <div className="flex items-start gap-2.5">
                    <span className="font-bold text-emerald-700 shrink-0">Langkah 1:</span>
                    <span>Klik tombol hijau <strong>"Simpan ke Google Sheet"</strong> atau <strong>"Hubungkan"</strong> di bagian atas dashboard atau tabel transaksi.</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="font-bold text-emerald-700 shrink-0">Langkah 2:</span>
                    <span>Login menggunakan akun Google Anda dan setujui izin Google Sheets & Google Drive.</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="font-bold text-emerald-700 shrink-0">Langkah 3:</span>
                    <span>Pilih <strong>"Buat Spreadsheet Baru"</strong> (misal: "Pembukuan Keuangan Telegram") atau masukkan ID Google Sheet yang sudah ada.</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="font-bold text-emerald-700 shrink-0">Langkah 4:</span>
                    <span>Klik <strong>"Sinkronkan Semua Transaksi"</strong>. Seluruh data transaksi akan langsung ditulis ke Google Sheet Anda lengkap dengan judul kolom berwarna, format mata uang, dan tanggal!</span>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-1">
                  <span className="font-semibold text-slate-800 block">💡 Tips Akses Cepat:</span>
                  <p>Setelah terhubung, klik tombol <strong>"Buka Google Sheet"</strong> kapan saja untuk langsung melihat spreadsheet online Anda di tab baru Google Docs.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Bot siap menerima pesan di Telegram secara instan
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors shadow-xs cursor-pointer"
          >
            Tutup Panduan
          </button>
        </div>
      </div>
    </div>
  );
}
