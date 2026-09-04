export type TransactionType = 'pengeluaran' | 'pemasukan';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  description: string;
  category: string;
  timestamp: string; // ISO string
  rawMessage?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  transaction?: Transaction;
  isRekap?: boolean;
}

export interface DailySummary {
  date: string;
  totalPemasukan: number;
  totalPengeluaran: number;
  saldoHariIni: number;
  saldoKeseluruhan: number;
  transactionCount: number;
}

export interface TelegramBotStatus {
  connected: boolean;
  botInfo?: {
    id: number;
    username: string;
    first_name: string;
  } | null;
  pollingActive: boolean;
  lastPolledAt?: string | null;
  lastError?: string | null;
  processedUpdatesCount?: number;
  watchdogRestartCount?: number;
  keepAliveCount?: number;
  uptimeSeconds?: number;
  isWebhookMode?: boolean;
  webhookUrl?: string | null;
  serverStartedAt?: string;
}
