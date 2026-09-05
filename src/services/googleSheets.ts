import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { Transaction, TransactionType } from '../types';
import { formatRupiah } from '../utils/formatters';

// Initialize Firebase App instance
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Provider with requested Workspace scopes
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive.file');

// Session-aware access token cache (valid for current browser session up to 50 min)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

const SESSION_TOKEN_KEY = 'gsheet_oauth_session_token';
const SESSION_TIME_KEY = 'gsheet_oauth_session_time';

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      let token = cachedAccessToken;
      if (!token) {
        try {
          const storedToken = sessionStorage.getItem(SESSION_TOKEN_KEY);
          const storedTime = sessionStorage.getItem(SESSION_TIME_KEY);
          if (storedToken && storedTime) {
            const ageMs = Date.now() - parseInt(storedTime, 10);
            if (ageMs < 50 * 60 * 1000) {
              token = storedToken;
              cachedAccessToken = storedToken;
            } else {
              sessionStorage.removeItem(SESSION_TOKEN_KEY);
              sessionStorage.removeItem(SESSION_TIME_KEY);
            }
          }
        } catch (_) {}
      }

      if (token) {
        if (onAuthSuccess) onAuthSuccess(user, token);
      } else {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      try {
        sessionStorage.removeItem(SESSION_TOKEN_KEY);
        sessionStorage.removeItem(SESSION_TIME_KEY);
      } catch (_) {}
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Gagal mendapatkan token akses dari Google.');
    }

    cachedAccessToken = credential.accessToken;
    try {
      sessionStorage.setItem(SESSION_TOKEN_KEY, credential.accessToken);
      sessionStorage.setItem(SESSION_TIME_KEY, Date.now().toString());
    } catch (_) {}

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: unknown) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  if (!cachedAccessToken) {
    try {
      const storedToken = sessionStorage.getItem(SESSION_TOKEN_KEY);
      const storedTime = sessionStorage.getItem(SESSION_TIME_KEY);
      if (storedToken && storedTime) {
        const ageMs = Date.now() - parseInt(storedTime, 10);
        if (ageMs < 50 * 60 * 1000) {
          cachedAccessToken = storedToken;
        }
      }
    } catch (_) {}
  }
  return cachedAccessToken;
};

export const setAccessToken = (token: string | null) => {
  cachedAccessToken = token;
  if (token) {
    try {
      sessionStorage.setItem(SESSION_TOKEN_KEY, token);
      sessionStorage.setItem(SESSION_TIME_KEY, Date.now().toString());
    } catch (_) {}
  } else {
    try {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
      sessionStorage.removeItem(SESSION_TIME_KEY);
    } catch (_) {}
  }
};

export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  try {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_TIME_KEY);
  } catch (_) {}
};

// Storage helper for linked Spreadsheet ID & URL
export const PRIMARY_SPREADSHEET_ID = '1w7BDRLWI9qHFL0FJxrvBPEbDkifDOCJdvVlr_c5PM_A';
export const PRIMARY_SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${PRIMARY_SPREADSHEET_ID}/edit`;

const SHEET_ID_STORAGE_KEY = 'telegram_keuangan_gsheet_id';
const SHEET_NAME_STORAGE_KEY = 'telegram_keuangan_gsheet_name';

export function getSavedSpreadsheetId(): string {
  return localStorage.getItem(SHEET_ID_STORAGE_KEY) || PRIMARY_SPREADSHEET_ID;
}

export function saveSpreadsheetInfo(id: string, name: string) {
  localStorage.setItem(SHEET_ID_STORAGE_KEY, id);
  localStorage.setItem(SHEET_NAME_STORAGE_KEY, name);
}

export function getSavedSpreadsheetName(): string {
  return localStorage.getItem(SHEET_NAME_STORAGE_KEY) || 'Pembukuan Keuangan Utama';
}

export function clearSpreadsheetInfo() {
  localStorage.removeItem(SHEET_ID_STORAGE_KEY);
  localStorage.removeItem(SHEET_NAME_STORAGE_KEY);
}

// Format Date string to Indonesian WIB
function formatToWibString(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) + ' WIB';
  } catch {
    return isoString;
  }
}

const DEFAULT_HEADERS = [
  'Tanggal (WIB)',
  'Tipe',
  'Kategori',
  'Nominal (Rp)',
  'Keterangan',
  'Pesan Asli',
  'Saldo Berjalan',
  'ID Transaksi',
];

/**
 * Creates a brand new Google Spreadsheet with predefined styling and headers.
 */
export async function createNewSpreadsheet(
  token: string,
  title = 'Pembukuan Keuangan Telegram'
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; title: string }> {
  const payload = {
    properties: {
      title,
    },
    sheets: [
      {
        properties: {
          title: 'Transaksi',
          gridProperties: {
            frozenRowCount: 1,
          },
        },
      },
    ],
  };

  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Gagal membuat Google Sheet baru.');
  }

  const data = await response.json();
  const spreadsheetId: string = data.spreadsheetId;
  const spreadsheetUrl: string =
    data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // Write headers to the new sheet
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Transaksi!A1:G1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: 'Transaksi!A1:G1',
        majorDimension: 'ROWS',
        values: [DEFAULT_HEADERS],
      }),
    }
  );

  saveSpreadsheetInfo(spreadsheetId, title);
  return { spreadsheetId, spreadsheetUrl, title };
}

/**
 * Validates access to an existing spreadsheet and retrieves its title.
 */
export async function verifySpreadsheet(
  token: string,
  spreadsheetId: string
): Promise<{ title: string; sheets: string[] }> {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties.title`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      err.error?.message ||
        'Tidak dapat mengakses Google Sheet tersebut. Pastikan ID valid dan Anda memiliki akses edit.'
    );
  }

  const data = await response.json();
  const title = data.properties?.title || 'Google Sheet';
  const sheets = (data.sheets || []).map((s: { properties?: { title?: string } }) => s.properties?.title || '');
  return { title, sheets };
}

/**
 * Syncs all current transactions to the linked Google Spreadsheet.
 * Writes headers in row 1 and all transactions in subsequent rows.
 */
export async function syncAllTransactionsToSheet(
  token: string,
  spreadsheetId: string,
  transactions: Transaction[],
  sheetTitle = 'Transaksi'
): Promise<{ rowCount: number }> {
  // First ensure sheet exists or create it
  const verify = await verifySpreadsheet(token, spreadsheetId);
  let targetSheet = verify.sheets.includes(sheetTitle)
    ? sheetTitle
    : verify.sheets[0] || 'Sheet1';

  // If Transaksi tab doesn't exist, create it so data is neatly organized
  if (!verify.sheets.includes(sheetTitle)) {
    try {
      const addRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                addSheet: {
                  properties: {
                    title: sheetTitle,
                  },
                },
              },
            ],
          }),
        }
      );
      if (addRes.ok) {
        targetSheet = sheetTitle;
      }
    } catch (_) {
      // Fallback to first available sheet if creation fails
    }
  }

  // Sort chronological
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const rows: (string | number)[][] = [
    DEFAULT_HEADERS,
    ...sorted.map((t, idx) => {
      const rowNum = idx + 2;
      const formulaSaldo =
        rowNum === 2
          ? `=IF(LOWER(B2)="pemasukan", D2, -D2)`
          : `=IF(LOWER(B${rowNum})="pemasukan", G${rowNum - 1}+D${rowNum}, G${rowNum - 1}-D${rowNum})`;

      return [
        formatToWibString(t.timestamp),
        t.type,
        t.category,
        t.amount,
        t.description,
        t.rawMessage || '',
        formulaSaldo,
        t.id,
      ];
    }),
  ];

  // Clear existing values to prevent leftover rows
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${targetSheet}'!A:H:clear`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  // Write all rows
  const putRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${targetSheet}'!A1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: `'${targetSheet}'!A1`,
        majorDimension: 'ROWS',
        values: rows,
      }),
    }
  );

  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Gagal menyinkronkan data ke Google Sheet.');
  }

  return { rowCount: transactions.length };
}

/**
 * Reads all transactions directly from the linked Google Spreadsheet.
 * Useful for pulling recent updates or offline edits back into the app database.
 */
export async function readTransactionsFromSheet(
  token: string,
  spreadsheetId: string,
  sheetTitle = 'Transaksi'
): Promise<Transaction[]> {
  const verify = await verifySpreadsheet(token, spreadsheetId);
  const targetSheet = verify.sheets.includes(sheetTitle)
    ? sheetTitle
    : verify.sheets[0] || 'Sheet1';

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${targetSheet}'!A2:H?valueRenderOption=FORMATTED_VALUE`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Gagal membaca data dari Google Sheet.');
  }

  const data = await res.json();
  const rows: string[][] = data.values || [];
  const parsedList: Transaction[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;

    const dateStr = r[0] || '';
    const rawType = (r[1] || 'pengeluaran').toLowerCase();
    const type: TransactionType = rawType.includes('masuk') ? 'pemasukan' : 'pengeluaran';
    const category = r[2] || 'Lainnya';
    const rawAmount = String(r[3] || '0').replace(/[^0-9]/g, '');
    const amount = parseInt(rawAmount, 10) || 0;
    const description = r[4] || 'Transaksi';
    const rawMessage = r[5] || '';
    const id = r[7] || `tx-gsheet-${Date.now()}-${i}`;

    if (amount > 0) {
      parsedList.push({
        id,
        type,
        amount,
        description,
        category,
        timestamp: dateStr || new Date().toISOString(),
        rawMessage,
      });
    }
  }

  return parsedList;
}

/**
 * Appends a single newly recorded transaction to the Google Sheet.
 */
export async function appendTransactionToSheet(
  token: string,
  spreadsheetId: string,
  t: Transaction,
  sheetTitle = 'Transaksi',
  estimatedRow = 2
): Promise<void> {
  const formulaSaldo =
    estimatedRow === 2
      ? `=IF(B2="pemasukan", D2, -D2)`
      : `=IF(B${estimatedRow}="pemasukan", G${estimatedRow - 1}+D${estimatedRow}, G${estimatedRow - 1}-D${estimatedRow})`;

  const row = [
    formatToWibString(t.timestamp),
    t.type,
    t.category,
    t.amount,
    t.description,
    t.rawMessage || '',
    formulaSaldo,
    t.id,
  ];

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetTitle}!A:H:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [row],
      }),
    }
  );

  if (!res.ok) {
    // If Transaksi tab doesn't exist, fallback to sync all
    console.warn('Append failed, falling back to full sync');
  }
}
