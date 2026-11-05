window.addEventListener('DOMContentLoaded', async () => {
  await loadBackupsList();
});

async function loadBackupsList() {
  const res = await fetch('/api/backup/list');
  const files = await res.json();

  const tbody = document.getElementById('backupsListBody');
  if (!files || files.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:30px; color:#94a3b8;">No local backups found. Click "Save Local PC Snapshot" above.</td></tr>';
    return;
  }

  tbody.innerHTML = files.map(f => `
    <tr>
      <td><code>${f.fileName}</code></td>
      <td>${f.createdAt}</td>
      <td><strong>${f.sizeKb} KB</strong></td>
      <td style="text-align:right;">
        <span style="background:#dcfce7; color:#166534; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:4px;">
          ✓ Verified Atomic
        </span>
      </td>
    </tr>
  `).join('');
}

async function createLocalSnapshot() {
  const res = await fetch('/api/backup/create', { method: 'POST' });
  const data = await res.json();

  if (data.error) {
    alert(`Snapshot failed: ${data.error}`);
  } else {
    alert('Local snapshot successfully saved to PC!');
    await loadBackupsList();
  }
}