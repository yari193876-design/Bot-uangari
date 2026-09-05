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
import { Transaction } from '../types';
import { formatRupiah } from '../utils/formatters';

// Initialize Firebase App instance
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Provider with requested Workspace scopes
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive.file');

// In-memory access token cache (MANDATORY: never store in localStorage)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // When user is re-hydrated on page reload, token may need to be refreshed
        try {
          // Token is obtained during signInWithPopup
          if (cachedAccessToken && onAuthSuccess) {
            onAuthSuccess(user, cachedAccessToken);
          } else if (onAuthFailure) {
            onAuthFailure();
          }
        } catch {
          cachedAccessToken = null;
          if (onAuthFailure) onAuthFailure();
        }
      }
    } else {
      cachedAccessToken = null;
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
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: unknown) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const setAccessToken = (token: string | null) => {
  cachedAccessToken = token;
};

export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
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
  // First ensure sheet exists or use first available sheet
  const verify = await verifySpreadsheet(token, spreadsheetId);
  const targetSheet = verify.sheets.includes(sheetTitle)
    ? sheetTitle
    : verify.sheets[0] || 'Sheet1';

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
          ? `=IF(B2="pemasukan", D2, -D2)`
          : `=IF(B${rowNum}="pemasukan", G${rowNum - 1}+D${rowNum}, G${rowNum - 1}-D${rowNum})`;

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
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${targetSheet}!A:H:clear`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  // Write all rows
  const putRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${targetSheet}!A1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: `${targetSheet}!A1`,
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
