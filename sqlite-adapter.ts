import fs from "fs";
import path from "path";

// Define the database path in the User's OS AppData directory (Windows) or Home directory (Linux/macOS)
const getAppDataDir = () => {
  try {
    const baseDir = process.env.APPDATA || 
                    (process.platform === "darwin" ? path.join(process.env.HOME || "", "Library", "Preferences") : path.join(process.env.HOME || "", ".config"));
    const appDir = path.join(baseDir, "RemixPharma");
    if (!fs.existsSync(appDir)) {
      fs.mkdirSync(appDir, { recursive: true });
    }
    return appDir;
  } catch (err) {
    console.warn("[Database] Failed to write in OS AppData directory, falling back to local workspace memory tmp folder:", err);
    const fallbackDir = path.join(process.cwd(), "tmp", "RemixPharma");
    try {
      if (!fs.existsSync(fallbackDir)) {
        fs.mkdirSync(fallbackDir, { recursive: true });
      }
    } catch (e) {
      console.error("[Database] Critical: Could not create even local tmp/RemixPharma directory", e);
    }
    return fallbackDir;
  }
};

const DB_DIR = getAppDataDir();
const SQLITE_DB_PATH = path.join(DB_DIR, "syrian-pharma.db");
const FALLBACK_JSON_PATH = path.join(DB_DIR, "syrian-pharma-db.json");

console.log(`[Database] Secure local database storage is mapped to: ${DB_DIR}`);

// Schema definition
const INITIALIZATION_QUERIES = [
  `CREATE TABLE IF NOT EXISTS medications (
    id TEXT PRIMARY KEY,
    tradeName TEXT NOT NULL,
    tradeNameAr TEXT,
    scientificName TEXT NOT NULL,
    strength TEXT,
    form TEXT,
    manufacturer TEXT,
    category TEXT,
    barcode TEXT,
    costPrice REAL,
    price REAL,
    minStockAlert INTEGER,
    stock INTEGER,
    expiryDate TEXT,
    supplierId TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    balance REAL
  )`,
  `CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    balance REAL
  )`,
  `CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    invoiceNumber TEXT NOT NULL,
    total REAL NOT NULL,
    totalUSD REAL,
    dollarRate REAL,
    discount REAL,
    paymentMethod TEXT,
    customerName TEXT,
    createdAt TEXT,
    soldBy TEXT,
    isSuspended INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoiceId TEXT,
    medicationId TEXT,
    tradeName TEXT,
    price REAL,
    quantity INTEGER,
    isPartial INTEGER,
    FOREIGN KEY (invoiceId) REFERENCES invoices(id)
  )`,
  `CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT,
    amountSYP REAL,
    amountUSD REAL,
    dollarRate REAL,
    date TEXT,
    notes TEXT,
    operator TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS medication_movements (
    id TEXT PRIMARY KEY,
    medicationId TEXT,
    tradeName TEXT,
    type TEXT,
    quantity INTEGER,
    date TEXT,
    referenceId TEXT,
    price REAL,
    operator TEXT,
    notes TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`
];

// In-Memory fallback Cache & JSON persistent database driver
class FileDatabaseDriver {
  private data: any = {
    medications: [],
    suppliers: [],
    customers: [],
    invoices: [],
    invoice_items: [],
    expenses: [],
    medication_movements: [],
    settings: {}
  };

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(FALLBACK_JSON_PATH)) {
        const raw = fs.readFileSync(FALLBACK_JSON_PATH, "utf8");
        this.data = { ...this.data, ...JSON.parse(raw) };
        if (!this.data.settings) {
          this.data.settings = {};
        }
        console.log("[Database] Loaded local persistent JSON database successfully.");
      } else {
        this.save();
        console.log("[Database] Initialized new JSON database file.");
      }
    } catch (e) {
      console.error("[Database] Error loading fallback JSON database", e);
      this.data.settings = this.data.settings || {};
    }
  }

  private save() {
    try {
      if (!this.data.settings) {
        this.data.settings = {};
      }
      fs.writeFileSync(FALLBACK_JSON_PATH, JSON.stringify(this.data, null, 2), "utf8");
    } catch (e) {
      console.error("[Database] Error saving fallback JSON database", e);
    }
  }

  getCollection(table: string) {
    return this.data[table] || [];
  }

  saveCollection(table: string, items: any[]) {
    this.data[table] = items;
    this.save();
  }

  getSetting(key: string): string {
    if (!this.data.settings) {
      this.data.settings = {};
    }
    return this.data.settings[key] || "";
  }

  saveSetting(key: string, value: string) {
    if (!this.data.settings) {
      this.data.settings = {};
    }
    this.data.settings[key] = value;
    this.save();
  }
}

// Global active instances
let sqliteInstance: any = null;
let useSqlite = false;
let fileDriverInstance = new FileDatabaseDriver();

// Try loading native sqlite3 driver dynamic bundle
try {
  // We use require or import wrapper for native binary
  const sqlite3 = require("sqlite3").verbose();
  
  if (sqlite3) {
    sqliteInstance = new sqlite3.Database(SQLITE_DB_PATH, (err: any) => {
      if (err) {
        console.error("[Database] Error opening SQLite database file, falling back to JSON storage.", err);
      } else {
        console.log(`[Database] Real SQLite .db file loaded successfully at: ${SQLITE_DB_PATH}`);
        useSqlite = true;
        
        // Execute Schema Tables Initialization
        sqliteInstance.serialize(() => {
          INITIALIZATION_QUERIES.forEach((query) => {
            sqliteInstance.run(query, (err: any) => {
              if (err) console.error("[Database] Schema Init Query Error:", err);
            });
          });
        });
      }
    });
  }
} catch (e) {
  console.log("[Database] Native sqlite3 driver not installed or compiling. Falling back to robust OS-level JSON file persistence.");
}

// Standard unified database APIs exported for the express backend
export const dbService = {
  // Save collection
  saveItems: async (table: string, items: any[]): Promise<void> => {
    if (useSqlite && sqliteInstance) {
      return new Promise((resolve, reject) => {
        // Truncate table and re-insert as a reliable atomic action
        sqliteInstance.serialize(() => {
          sqliteInstance.run(`BEGIN TRANSACTION`);
          sqliteInstance.run(`DELETE FROM ${table}`);
          
          if (items.length === 0) {
            sqliteInstance.run(`COMMIT`, (err: any) => {
              if (err) {
                sqliteInstance.run("ROLLBACK");
                reject(err);
              } else resolve();
            });
            return;
          }

          // Build SQL dynamic insert query
          const keys = Object.keys(items[0]);
          const columns = keys.join(", ");
          const placeholders = keys.map(() => "?").join(", ");
          const insertStmt = sqliteInstance.prepare(`INSERT INTO ${table} (${columns}) VALUES (${placeholders})`);

          let hasError = false;
          items.forEach((item) => {
            const values = keys.map(k => {
              const val = item[k];
              if (typeof val === "object" && val !== null) {
                return JSON.stringify(val); // serialize child arrays / objects safely
              }
              return val;
            });
            
            insertStmt.run(values, (err: any) => {
              if (err) {
                console.error(`[Database] SQLite Insert error on ${table}:`, err);
                hasError = true;
              }
            });
          });

          insertStmt.finalize();

          sqliteInstance.run(hasError ? `ROLLBACK` : `COMMIT`, (err: any) => {
            if (err || hasError) {
              reject(err || new Error("Failed to insert items"));
            } else {
              resolve();
            }
          });
        });
      });
    } else {
      // Fallback Engine
      fileDriverInstance.saveCollection(table, items);
    }
  },

  // Get collection
  getItems: async <T>(table: string): Promise<T[]> => {
    if (useSqlite && sqliteInstance) {
      return new Promise((resolve, reject) => {
        sqliteInstance.all(`SELECT * FROM ${table}`, (err: any, rows: any[]) => {
          if (err) {
            reject(err);
          } else {
            // De-serialize objects
            const processedRows = rows.map((row) => {
              const processed: any = {};
              for (const key in row) {
                const val = row[key];
                if (typeof val === "string" && (val.startsWith("[") || val.startsWith("{"))) {
                  try {
                    processed[key] = JSON.parse(val);
                  } catch {
                    processed[key] = val;
                  }
                } else {
                  processed[key] = val;
                }
              }
              return processed;
            });
            resolve(processedRows);
          }
        });
      });
    } else {
      return fileDriverInstance.getCollection(table) as T[];
    }
  },

  // Secure local API credentials storage
  getSecureApiKey: async (): Promise<string> => {
    if (useSqlite && sqliteInstance) {
      return new Promise((resolve) => {
        sqliteInstance.get(`SELECT value FROM app_settings WHERE key = ?`, ["gemini_api_key"], (err: any, row: any) => {
          if (err || !row) {
            // fallback to env if exists
            resolve(process.env.GEMINI_API_KEY || "");
          } else {
            resolve(row.value);
          }
        });
      });
    } else {
      return fileDriverInstance.getSetting("gemini_api_key") || process.env.GEMINI_API_KEY || "";
    }
  },

  // Set secure local API credentials
  setSecureApiKey: async (key: string): Promise<void> => {
    if (useSqlite && sqliteInstance) {
      return new Promise((resolve, reject) => {
        sqliteInstance.run(
          `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          ["gemini_api_key", key],
          (err: any) => {
            if (err) reject(err);
            else {
              // Update runtime process.env
              process.env.GEMINI_API_KEY = key;
              resolve();
            }
          }
        );
      });
    } else {
      fileDriverInstance.saveSetting("gemini_api_key", key);
      process.env.GEMINI_API_KEY = key;
    }
  },

  // Get path for the database file (for display in backup management)
  getDatabaseDetails: () => {
    return {
      sqlitePath: SQLITE_DB_PATH,
      fallbackJsonPath: FALLBACK_JSON_PATH,
      activeEngine: useSqlite ? "SQLite (.db Native)" : "Offline File Storage (.json Ecosystem)",
      directory: DB_DIR
    };
  }
};
