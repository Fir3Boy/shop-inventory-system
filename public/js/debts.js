window.addEventListener('DOMContentLoaded', async () => {
  await loadPartiesList();
});

async function loadPartiesList() {
  const res = await fetch('/api/parties');
  const parties = await res.json();

  const tbody = document.getElementById('partiesTableBody');
  tbody.innerHTML = parties.map(p => `
    <tr>
      <td><strong>${p.name}</strong></td>
      <td>${p.type}</td>
      <td>${p.phone || '-'}</td>
      <td style="font-weight:bold; color: ${p.current_balance > 0 ? '#16a34a' : '#dc2626'}">
        $${p.current_balance.toFixed(2)}
      </td>
      <td>
        <button class="btn-action" style="padding:4px 8px; font-size:0.85rem;" onclick="viewLedger(${p.id}, '${p.name}', ${p.current_balance})">
          View Ledger
        </button>
      </td>
    </tr>
  `).join('');
}

async function viewLedger(partyId, partyName, balance) {
  document.getElementById('ledgerPartyTitle').innerText = `${partyName} (Current Bal: $${balance.toFixed(2)})`;
  document.getElementById('paymentPartyId').value = partyId;

  const res = await fetch(`/api/parties/${partyId}/ledger`);
  const logs = await res.json();

  const tbody = document.getElementById('ledgerLogsBody');
  if (logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No transaction logs found.</td></tr>';
  } else {
    tbody.innerHTML = logs.map(l => `
      <tr>
        <td><small>${new Date(l.created_at).toLocaleDateString()}</small></td>
        <td>${l.description}</td>
        <td>${l.entry_type}</td>
        <td>$${l.amount.toFixed(2)}</td>
        <td><strong>$${l.balance_after.toFixed(2)}</strong></td>
      </tr>
    `).join('');
  }

  document.getElementById('ledgerModal').style.display = 'flex';
}

async function recordDirectPayment(e) {
  e.preventDefault();
  const partyId = document.getElementById('paymentPartyId').value;
  const amount = parseFloat(document.getElementById('payAmount').value);

  const res = await fetch(`/api/parties/${partyId}/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount })
  });

  if (res.ok) {
    alert('Payment Recorded!');
    document.getElementById('ledgerModal').style.display = 'none';
    await loadPartiesList();
  }
}