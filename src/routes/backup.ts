import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { db } from '../db';

const router = Router();
const BACKUP_DIR = path.resolve(process.cwd(), 'backups');

// Ensure backups directory exists on disk
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// 1. One-Click Browser Download (Save directly to USB Flash Drive)
router.get('/download', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `textile_backup_${timestamp}.sqlite`;
    const tempBackupPath = path.join(BACKUP_DIR, fileName);

    // SQLite requires forward slashes even on Windows for VACUUM INTO
    const normalizedPath = tempBackupPath.replace(/\\/g, '/');

    // Atomic SQLite snapshot
    await db.run(`VACUUM INTO '${normalizedPath}'`);

    // Stream the file to browser as a download
    res.download(tempBackupPath, fileName, (err) => {
      if (err) {
        console.error('Download stream error:', err);
      }
    });
  } catch (err) { next(err); }
});

// 2. Create a Local Snapshot on the PC
router.post('/create', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `auto_backup_${timestamp}.sqlite`;
    const targetPath = path.join(BACKUP_DIR, fileName);
    const normalizedPath = targetPath.replace(/\\/g, '/');

    await db.run(`VACUUM INTO '${normalizedPath}'`);

    // Prune old backups (Keep only the 15 most recent to save disk space)
    pruneOldBackups();

    res.json({ success: true, message: 'Local snapshot successfully created.', fileName });
  } catch (err) { next(err); }
});

// 3. List All Stored Local Backups
router.get('/list', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      return res.json([]);
    }

    const files = fs.readdirSync(BACKUP_DIR)
      .filter(file => file.endsWith('.sqlite'))
      .map(file => {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = fs.statSync(filePath);
        return {
          fileName: file,
          sizeKb: (stats.size / 1024).toFixed(1),
          createdAt: stats.birthtime.toLocaleString()
        };
      })
      .reverse(); // Newest first

    res.json(files);
  } catch (err) { next(err); }
});

// Helper: Prune backups older than 15 entries
function pruneOldBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(file => file.endsWith('.sqlite'))
      .map(file => ({
        name: file,
        time: fs.statSync(path.join(BACKUP_DIR, file)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    // Delete beyond the newest 15 files
    if (files.length > 15) {
      files.slice(15).forEach(f => {
        fs.unlinkSync(path.join(BACKUP_DIR, f.name));
      });
    }
  } catch (e) {
    console.error('Error pruning old backups:', e);
  }
}

export default router;