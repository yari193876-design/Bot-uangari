import {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
  type ReactNode,
} from 'react';
import { Send, Bot, CheckCheck, Trash2, Sparkles, HelpCircle, ExternalLink } from 'lucide-react';
import { ChatMessage, TelegramBotStatus } from '../types';

export interface TelegramChatHandle {
  sendQuickPrompt: (text: string) => void;
}

interface TelegramChatProps {
  onTransactionUpdated: () => void;
  onOpenGuide: () => void;
  botStatus?: TelegramBotStatus | null;
}

const QUICK_PROMPTS = [
  { label: '🔴 K 20000 makan', text: 'K 20000 makan' },
  { label: '🔴 habis beli makan 20rb', text: 'habis beli makan 20rb' },
  { label: '🟢 M 500000 freelance', text: 'M 500000 freelance' },
  { label: '📊 REKAP', text: 'REKAP' },
  { label: '📈 REKAP MINGGUAN', text: 'REKAP MINGGUAN' },
  { label: '✏️ EDIT TERAKHIR 30rb rokok', text: 'EDIT TERAKHIR 30rb rokok' },
  { label: '✏️ EDIT (Bantuan)', text: 'EDIT' },
];

const TelegramChat = forwardRef<TelegramChatHandle, TelegramChatProps>(
  ({ onTransactionUpdated, onOpenGuide, botStatus }, ref) => {
    const botUsername = botStatus?.botInfo?.username || 'Hahaha_uangbot';
    const botFirstName = botStatus?.botInfo?.first_name || 'Hahahha (Bot Keuangan)';
    const isConnected = botStatus?.connected ?? true;

    const [messages, setMessages] = useState<ChatMessage[]>(() => [
      {
        id: 'welcome-1',
        sender: 'bot',
        text: `Halo Kak! 👋 Saya adalah *Asisten Pencatat Keuangan Pribadi* kamu via Telegram.
Bot ini sudah *tersambung secara resmi* ke akun Telegram *@${botUsername}*! 🚀

Kamu bisa:
1. Mencatat transaksi di simulator ini atau *langsung chat di Telegram HP kamu* (@${botUsername}).
2. Pakai bahasa santai (*"habis beli makan 20rb"*) maupun format kilat (*"K 20000 makan"*).
3. ✏️ *Edit transaksi via chat:* Ketik *EDIT TERAKHIR 30rb rokok* atau ketik *EDIT* untuk panduan.
4. 📈 *Rekap mingguan & harian:* Ketik *REKAP* (hari ini) atau *REKAP MINGGUAN* (7 hari terakhir).
5. Mengekstrak otomatis: Tipe (🔴 Pengeluaran / 🟢 Pemasukan), Nominal (Rp), Kategori, dan Keterangan.

Silakan coba ketik transaksimu atau coba tombol cepat di bawah ya! 😊`,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      },
    ]);

    const [inputMessage, setInputMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
      scrollToBottom();
    }, [messages, isLoading]);

    const handleSendMessage = async (textToSend?: string) => {
      const message = (textToSend !== undefined ? textToSend : inputMessage).trim();
      if (!message || isLoading) return;

      const userMsg: ChatMessage = {
        id: 'msg-' + Date.now(),
        sender: 'user',
        text: message,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, userMsg]);
      if (textToSend === undefined) {
        setInputMessage('');
      }
      setIsLoading(true);

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        });

        if (!response.ok) {
          throw new Error('Gagal memproses pesan');
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error('Respon server tidak valid');
        }

        const data = await response.json();

        const botMsg: ChatMessage = {
          id: 'bot-' + Date.now(),
          sender: 'bot',
          text: data.reply || 'Transaksi telah dicatat.',
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          transaction: data.transaction,
          isRekap: data.isRekap,
        };

        setMessages((prev) => [...prev, botMsg]);
        onTransactionUpdated();
      } catch (err: any) {
        const errorMsg: ChatMessage = {
          id: 'err-' + Date.now(),
          sender: 'bot',
          text: 'Mohon maaf, terjadi kendala saat memproses pesan. Silakan coba lagi ya Kak.',
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsLoading(false);
      }
    };

    useImperativeHandle(ref, () => ({
      sendQuickPrompt(text: string) {
        handleSendMessage(text);
      },
    }));

    const clearChat = () => {
      if (window.confirm('Bersihkan riwayat percakapan di simulator chat?')) {
        setMessages([
          {
            id: 'cleared-1',
            sender: 'bot',
            text: 'Riwayat percakapan telah dibersihkan. Silakan mulai mencatat transaksi baru! 😊',
            timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    };

    // Helper to render formatted text with basic Markdown styling (bold *text*, italic _text_, code `text`)
    const renderFormattedText = (raw: string) => {
      const lines = raw.split('\n');
      return lines.map((line, idx) => {
        // Horizontal separator
        if (line.includes('━━━━━━━━━━━━━━━━━━━━') || line.trim() === '---') {
          return <hr key={idx} className="my-2 border-slate-200" />;
        }

        // Convert *bold* to <strong>, _italic_ to <em>
        const formattedParts: (string | ReactNode)[] = [];
        const regex = /(\*[^*]+\*|_[^_]+_|`[^`]+`)/g;
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(line)) !== null) {
          if (match.index > lastIndex) {
            formattedParts.push(line.substring(lastIndex, match.index));
          }
          const matchedStr = match[0];
          if (matchedStr.startsWith('*') && matchedStr.endsWith('*')) {
            formattedParts.push(
              <strong key={match.index} className="font-semibold text-slate-900">
                {matchedStr.slice(1, -1)}
              </strong>
            );
          } else if (matchedStr.startsWith('_') && matchedStr.endsWith('_')) {
            formattedParts.push(
              <em key={match.index} className="italic text-slate-600">
                {matchedStr.slice(1, -1)}
              </em>
            );
          } else if (matchedStr.startsWith('`') && matchedStr.endsWith('`')) {
            formattedParts.push(
              <code
                key={match.index}
                className="bg-slate-100 text-slate-800 px-1 py-0.5 rounded-md text-xs font-mono font-medium"
              >
                {matchedStr.slice(1, -1)}
              </code>
            );
          }
          lastIndex = regex.lastIndex;
        }

        if (lastIndex < line.length) {
          formattedParts.push(line.substring(lastIndex));
        }

        return (
          <p key={idx} className="min-h-[1.25rem] text-[13.5px] leading-relaxed break-words">
            {formattedParts.length > 0 ? formattedParts : line}
          </p>
        );
      });
    };

    return (
      <div className="flex flex-col h-full bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Telegram Bento Header */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-2xl bg-sky-500 flex items-center justify-center text-white shadow-xs">
                <Bot className="w-5 h-5" />
              </div>
              <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 ${isConnected ? 'bg-emerald-500' : 'bg-amber-500'} border-2 border-slate-900 rounded-full animate-pulse`}></span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm leading-tight text-white">{botFirstName}</h2>
                <span className="text-[10px] bg-sky-500/20 text-sky-300 font-bold px-1.5 py-0.5 rounded-md border border-sky-400/30">
                  OFFICIAL BOT
                </span>
              </div>
              <p className="text-xs text-sky-300/90 font-mono mt-0.5">
                @{botUsername} • <span className="text-emerald-400 font-sans font-semibold">Tersambung (API 24/7)</span>
              </p>
            </div>
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-1.5">
            <a
              href={`https://t.me/${botUsername}`}
              target="_blank"
              rel="noreferrer"
              title="Buka bot asli di aplikasi Telegram"
              className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white transition-colors flex items-center gap-1.5 text-xs font-semibold shadow-2xs cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Buka Telegram</span>
            </a>
            <button
              id="open-guide-btn"
              type="button"
              onClick={onOpenGuide}
              title="Panduan Penggunaan"
              className="px-2.5 py-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-1.5 text-xs font-medium cursor-pointer"
            >
              <HelpCircle className="w-4 h-4 text-sky-400" />
              <span className="hidden sm:inline">Panduan</span>
            </button>
            <button
              id="clear-chat-btn"
              type="button"
              onClick={clearChat}
              title="Bersihkan Chat"
              className="p-1.5 rounded-xl text-slate-400 hover:text-rose-300 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Live Bot Connection Notice Banner */}
        <div className="bg-sky-50 border-b border-sky-100 px-4 py-2.5 flex items-center justify-between text-xs text-sky-900 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0"></span>
            <span>
              <strong>Real-Time Sync:</strong> Chat di aplikasi Telegram HP kamu (<strong>@{botUsername}</strong>) akan otomatis tercatat di dashboard ini!
            </span>
          </div>
          <a
            href={`https://t.me/${botUsername}`}
            target="_blank"
            rel="noreferrer"
            className="text-sky-700 hover:text-sky-900 font-bold underline shrink-0 ml-2"
          >
            Chat di HP ↗
          </a>
        </div>

        {/* Chat Messages Area */}
        <div
          id="telegram-chat-messages"
          className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/70"
        >
          {/* Date separator */}
          <div className="flex justify-center my-1">
            <span className="bg-slate-200/80 text-slate-600 text-[11px] font-bold uppercase tracking-wider px-3 py-0.5 rounded-full shadow-2xs">
              Hari ini
            </span>
          </div>

          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-7 h-7 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 mb-0.5 text-xs shadow-2xs">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`relative max-w-[88%] sm:max-w-[80%] rounded-2xl px-4 py-3 shadow-2xs ${
                    isUser
                      ? 'bg-emerald-50 text-slate-900 rounded-br-xs border border-emerald-200/80'
                      : 'bg-white text-slate-800 rounded-bl-xs border border-slate-200'
                  }`}
                >
                  {/* Message Body */}
                  <div className="space-y-0.5">{renderFormattedText(msg.text)}</div>

                  {/* Footer with Timestamp & Read status */}
                  <div
                    className={`flex items-center justify-end gap-1 mt-1.5 text-[10.5px] ${
                      isUser ? 'text-emerald-800/70' : 'text-slate-400'
                    }`}
                  >
                    <span>{msg.timestamp}</span>
                    {isUser && <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Typing indicator */}
          {isLoading && (
            <div className="flex items-end gap-2 justify-start">
              <div className="w-7 h-7 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 text-xs">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-white rounded-2xl rounded-bl-xs px-4 py-2.5 shadow-2xs border border-slate-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce"></span>
                <span className="text-xs text-slate-400 font-medium ml-1">Bot mencatat...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Prompts Carousel */}
        <div className="px-4 py-2 bg-white border-t border-slate-100 overflow-x-auto no-scrollbar shrink-0">
          <div className="flex items-center gap-1.5 pb-0.5">
            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0 mr-1">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>Contoh:</span>
            </div>
            {QUICK_PROMPTS.map((p, i) => (
              <button
                key={i}
                type="button"
                id={`quick-prompt-${i}`}
                onClick={() => handleSendMessage(p.text)}
                disabled={isLoading}
                className="text-xs font-medium whitespace-nowrap px-3 py-1 rounded-full bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 text-slate-700 border border-slate-200 transition-all shrink-0 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Message Input Bar */}
        <div className="p-3.5 bg-white border-t border-slate-100 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              id="telegram-chat-input"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Tulis transaksi (contoh: K 20000 makan atau REKAP)..."
              disabled={isLoading}
              className="flex-1 bg-slate-50 hover:bg-slate-100/80 focus:bg-white text-slate-800 placeholder-slate-400 text-sm px-4 py-2.5 rounded-2xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
            />
            <button
              type="submit"
              id="telegram-send-btn"
              disabled={isLoading || !inputMessage.trim()}
              className="w-10 h-10 rounded-2xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-400 text-white flex items-center justify-center transition-all shrink-0 shadow-xs cursor-pointer disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4 ml-0.5" />
            </button>
          </form>
        </div>
      </div>
    );
  }
);

TelegramChat.displayName = 'TelegramChat';

export default TelegramChat;
