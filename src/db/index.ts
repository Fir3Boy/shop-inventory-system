import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

// Enable verbose mode in development for stack traces
const sqlite = sqlite3.verbose();

const DB_PATH = path.resolve(process.cwd(), 'data', 'inventory.sqlite');
const SCHEMA_PATH = path.resolve(__dirname, 'schema.sql');

class DatabaseManager {
  private static instance: DatabaseManager;
  private db: sqlite3.Database;

  private constructor() {
    // Ensure the output data directory exists
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new sqlite.Database(DB_PATH, (err) => {
      if (err) {
        console.error('CRITICAL: SQLite connection failure', err);
        process.exit(1);
      }
    });

    this.initializePragmas();
  }

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  private initializePragmas(): void {
    // WAL allows concurrent readers and non-blocking writes
    this.db.serialize(() => {
      this.db.run('PRAGMA journal_mode = WAL;');
      this.db.run('PRAGMA foreign_keys = ON;');
      this.db.run('PRAGMA busy_timeout = 5000;');
      this.db.run('PRAGMA synchronous = NORMAL;');
    });
  }

  public async initializeSchema(): Promise<void> {
    try {
      const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
      await this.exec(sql);
      console.log('Database schema & system seeds successfully verified.');
    } catch (err) {
      console.error('Database migration failed during execution of schema.sql:', err);
      throw err;
    }
  }

  public getRawDatabase(): sqlite3.Database {
    return this.db;
  }

  // --- Promisified Query API ---

  public run(sql: string, params: unknown[] = []): Promise<sqlite3.RunResult> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve(this);
        }
      });
    });
  }

  public get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err: Error | null, row: T) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  public all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err: Error | null, rows: T[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  public exec(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Safe transaction wrapper for atomic mutations (e.g., committing drafts to stock/ledger).
   */
  public async transaction<T>(callback: () => Promise<T>): Promise<T> {
    await this.run('BEGIN TRANSACTION;');
    try {
      const result = await callback();
      await this.run('COMMIT;');
      return result;
    } catch (error) {
      await this.run('ROLLBACK;');
      throw error;
    }
  }

  public async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

export const db = DatabaseManager.getInstance();