import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface StoredTransaction {
  id: string;
  type: 'pengeluaran' | 'pemasukan';
  amount: number;
  description: string;
  category: string;
  timestamp: string; // ISO string
  rawMessage?: string;
}

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  project_id?: string;
}

// In-memory token cache
let cachedToken: string | null = null;
let cachedTokenExpiry: number = 0; // timestamp in ms

/**
 * Load Service Account credentials from environment or service-account.json
 */
export function getServiceAccountCredentials(): ServiceAccountCredentials | null {
  // 1. Check environment variable (raw JSON or base64)
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
      const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY.trim();
      const jsonStr = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf-8');
      const parsed = JSON.parse(jsonStr);
      if (parsed.client_email && parsed.private_key) {
        return {
          client_email: parsed.client_email,
          private_key: parsed.private_key,
          project_id: parsed.project_id,
        };
      }
    } catch (e) {
      console.warn('[Google Sheets] Gagal mem-parse GOOGLE_SERVICE_ACCOUNT_KEY:', e);
    }
  }

  // 2. Check GOOGLE_APPLICATION_CREDENTIALS path
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    try {
      const content = fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed.client_email && parsed.private_key) {
        return {
          client_email: parsed.client_email,
          private_key: parsed.private_key,
          project_id: parsed.project_id,
        };
      }
    } catch (_) {}
  }

  // 3. Check workspace root service-account.json
  const defaultPath = path.join(process.cwd(), 'service-account.json');
  if (fs.existsSync(defaultPath)) {
    try {
      const content = fs.readFileSync(defaultPath, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed.client_email && parsed.private_key) {
        return {
          client_email: parsed.client_email,
          private_key: parsed.private_key,
          project_id: parsed.project_id,
        };
      }
    } catch (e) {
      console.warn('[Google Sheets] Gagal membaca service-account.json:', e);
    }
  }

  return null;
}

export function isServiceAccountConfigured(): boolean {
  return getServiceAccountCredentials() !== null;
}

export function getServiceAccountEmail(): string | null {
  const creds = getServiceAccountCredentials();
  return creds ? creds.client_email : null;
}

/**
 * Generate Google OAuth2 Access Token using RS256 signed JWT
 */
export async function getServiceAccountAccessToken(): Promise<string> {
  const creds = getServiceAccountCredentials();
  if (!creds) {
    throw new Error('Kredensial Google Service Account tidak ditemukan.');
  }

  // Check cached token (reuse if more than 2 minutes remain)
  const nowMs = Date.now();
  if (cachedToken && cachedTokenExpiry > nowMs + 120000) {
    return cachedToken;
  }

  const nowSec = Math.floor(nowMs / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
    aud: 'https://oauth2.googleapis.com/token',
    exp: nowSec + 3600,
    iat: nowSec,
  };

  const base64url = (input: string | Buffer): string => {
    const buf = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
    return buf.toString('base64url');
  };

  const signInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signInput);
  const signature = sign.sign(creds.private_key, 'base64url');
  const jwt = `${signInput}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Gagal mendapatkan Google Access Token (${tokenRes.status}): ${errText}`);
  }

  const tokenData = (await tokenRes.json()) as { access_token: string; expires_in: number };
  cachedToken = tokenData.access_token;
  cachedTokenExpiry = nowMs + (tokenData.expires_in || 3600) * 1000;

  return cachedToken;
}

/**
 * Format timestamp into Indonesian Western Time (WIB, UTC+7) string
 */
export function formatToWIB(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) + ' WIB';
  } catch (_) {
    return isoString;
  }
}

/**
 * Synchronize all transactions directly into the Google Sheet via Service Account:
 * 1. Computes running balance in pure backend math (prevents #ERROR! in Google Sheets)
 * 2. Writes amount and running balance as pure Numbers (no currency string/formula bug)
 * 3. Formats header row (emerald background, white text, bold) and freezes row 1
 * 4. Formats Nominal & Saldo Berjalan columns with currency formatting
 */
export async function syncAllTransactionsToSheets(
  transactions: StoredTransaction[],
  spreadsheetId: string
): Promise<{ success: boolean; updatedRows: number; spreadsheetId: string }> {
  const token = await getServiceAccountAccessToken();

  // 1. Ensure sheet "Transaksi" exists and fetch metadata
  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!metaRes.ok) {
    const errBody = await metaRes.text();
    if (metaRes.status === 403 || metaRes.status === 404) {
      const email = getServiceAccountEmail() || 'Service Account';
      throw new Error(
        `Akses ditolak ke Spreadsheet (${metaRes.status}). Pastikan Spreadsheet sudah di-share (Bagikan) ke email Service Account: ${email} sebagai Editor.`
      );
    }
    throw new Error(`Gagal membaca metadata Spreadsheet (${metaRes.status}): ${errBody}`);
  }

  const meta = (await metaRes.json()) as {
    properties?: { title?: string };
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
  };

  let transaksiSheet = meta.sheets?.find((s) => s.properties?.title === 'Transaksi');
  let sheetId = transaksiSheet?.properties?.sheetId;

  if (!transaksiSheet) {
    // Tab "Transaksi" doesn't exist yet, create it!
    const addSheetRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
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
                title: 'Transaksi',
                gridProperties: { frozenRowCount: 1 },
              },
            },
          },
        ],
      }),
    });
    if (addSheetRes.ok) {
      const addData = (await addSheetRes.json()) as any;
      sheetId = addData.replies?.[0]?.addSheet?.properties?.sheetId || 0;
    } else {
      sheetId = 0;
    }
  }

  // 2. Sort transactions chronologically ascending for correct running balance
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // 3. Build data rows with pure numbers and backend calculated running balance
  let runningBalance = 0;
  const rows: (string | number)[][] = [
    [
      'Waktu (WIB)',
      'Tipe',
      'Kategori',
      'Nominal (Rp)',
      'Keterangan',
      'Pesan Asli',
      'Saldo Berjalan (Rp)',
      'ID Transaksi',
    ],
  ];

  for (const t of sorted) {
    const numAmount = Number(t.amount) || 0;
    if (t.type === 'pemasukan') {
      runningBalance += numAmount;
    } else {
      runningBalance -= numAmount;
    }

    const wibTime = formatToWIB(t.timestamp);
    rows.push([
      wibTime,
      t.type,
      t.category || 'Lainnya',
      numAmount, // pure number!
      t.description || 'Transaksi',
      t.rawMessage || '',
      runningBalance, // pure number computed by backend!
      t.id,
    ]);
  }

  // 4. Clear existing values in sheet
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Transaksi!A:H:clear`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  // 5. Write all rows with USER_ENTERED
  const writeRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Transaksi!A1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: 'Transaksi!A1',
        majorDimension: 'ROWS',
        values: rows,
      }),
    }
  );

  if (!writeRes.ok) {
    const errText = await writeRes.text();
    throw new Error(`Gagal menulis data ke Google Sheet (${writeRes.status}): ${errText}`);
  }

  // 6. Apply visual formatting & currency styling via batchUpdate (non-blocking)
  if (sheetId !== undefined) {
    try {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            // Freeze header row
            {
              updateSheetProperties: {
                properties: {
                  sheetId: sheetId,
                  gridProperties: { frozenRowCount: 1 },
                },
                fields: 'gridProperties.frozenRowCount',
              },
            },
            // Header styling: emerald green, white bold text, centered
            {
              repeatCell: {
                range: {
                  sheetId: sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1,
                  startColumnIndex: 0,
                  endColumnIndex: 8,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.063, green: 0.725, blue: 0.506 },
                    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 10 },
                    horizontalAlignment: 'CENTER',
                  },
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
              },
            },
            // Format Column D (Nominal) as Currency
            {
              repeatCell: {
                range: {
                  sheetId: sheetId,
                  startRowIndex: 1,
                  startColumnIndex: 3,
                  endColumnIndex: 4,
                },
                cell: {
                  userEnteredFormat: {
                    numberFormat: { type: 'CURRENCY', pattern: '"Rp"#,##0' },
                    horizontalAlignment: 'RIGHT',
                  },
                },
                fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
              },
            },
            // Format Column G (Saldo Berjalan) as Currency
            {
              repeatCell: {
                range: {
                  sheetId: sheetId,
                  startRowIndex: 1,
                  startColumnIndex: 6,
                  endColumnIndex: 7,
                },
                cell: {
                  userEnteredFormat: {
                    numberFormat: { type: 'CURRENCY', pattern: '"Rp"#,##0' },
                    horizontalAlignment: 'RIGHT',
                  },
                },
                fields: 'userEnteredFormat(numberFormat,horizontalAlignment)',
              },
            },
          ],
        }),
      });
    } catch (fmtErr) {
      console.warn('[Google Sheets] Gagal menerapkan styling (opsional):', fmtErr);
    }
  }

  console.log(
    `[Google Sheets 24/7] Berhasil menyinkronkan ${rows.length - 1} transaksi ke spreadsheet ${spreadsheetId}.`
  );

  return {
    success: true,
    updatedRows: rows.length,
    spreadsheetId,
  };
}

// Debounce state to prevent flooding if multiple telegram messages arrive simultaneously
let syncTimeout: NodeJS.Timeout | null = null;

/**
 * Triggers background synchronization with automatic 400ms debounce.
 * This runs completely asynchronously without blocking the Telegram reply!
 */
export function triggerBackgroundGoogleSheetsSync(
  transactions: StoredTransaction[],
  spreadsheetId: string
) {
  if (!isServiceAccountConfigured()) return;

  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }

  syncTimeout = setTimeout(async () => {
    try {
      await syncAllTransactionsToSheets(transactions, spreadsheetId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Google Sheets 24/7 Auto-Sync Error]:', msg);
    }
  }, 400);
}
