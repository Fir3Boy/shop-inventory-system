window.addEventListener('DOMContentLoaded', async () => {
  await loadSuppliers();
});

async function loadSuppliers() {
  const res = await fetch('/api/suppliers');
  const data = await res.json();

  document.getElementById('txtTotalPayable').innerText = `$${data.totalPayable.toFixed(2)}`;
  
  const pending = data.suppliers.filter(s => s.current_balance < 0);
  document.getElementById('txtSupplierCount').innerText = pending.length;

  const tbody = document.getElementById('suppliersTableBody');
  if (data.suppliers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:#64748b;">No suppliers registered.</td></tr>';
    return;
  }

  tbody.innerHTML = data.suppliers.map(s => {
    // In SQLite, negative balance means we owe the supplier
    const amountOwed = s.current_balance < 0 ? Math.abs(s.current_balance) : 0;
    return `
      <tr>
        <td><strong>${s.name}</strong></td>
        <td>${s.phone || '-'}</td>
        <td><small style="color:#64748b;">${s.address || '-'}</small></td>
        <td style="font-weight:800; font-size:1.1rem; color: ${amountOwed > 0 ? '#dc2626' : '#64748b'};">
          $${amountOwed.toFixed(2)}
        </td>
        <td class="no-print" style="text-align:right;">
          <button class="btn-action" style="padding:6px 12px; font-size:0.85rem; background:#7c3aed;" 
                  onclick="openSupplierLedger(${s.id})">
            🏭 View Ledger / Pay
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function openSupplierLedger(supplierId) {
  const res = await fetch(`/api/suppliers/${supplierId}/ledger`);
  const data = await res.json();

  const owed = data.supplier.current_balance < 0 ? Math.abs(data.supplier.current_balance) : 0;
  document.getElementById('modalSupplierTitle').innerText = 
    `${data.supplier.name} (Amount Owed: $${owed.toFixed(2)})`;
  document.getElementById('payoutSupplierId').value = supplierId;
  document.getElementById('payoutAmount').value = '';
  document.getElementById('payoutNote').value = '';

  const tbody = document.getElementById('modalSupplierLogs');
  if (data.entries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No transaction records.</td></tr>';
  } else {
    tbody.innerHTML = data.entries.map(e => `
      <tr>
        <td><small>${new Date(e.created_at).toLocaleDateString()}</small></td>
        <td>${e.description}</td>
        <td><span style="font-weight:bold; color:${e.entry_type === 'DEBIT' ? '#16a34a' : '#dc2626'}">${e.entry_type}</span></td>
        <td>$${e.amount.toFixed(2)}</td>
        <td><strong>$${Math.abs(e.balance_after).toFixed(2)}</strong></td>
      </tr>
    `).join('');
  }

  document.getElementById('supplierLedgerModal').style.display = 'flex';
}

function closeSupplierModal() {
  document.getElementById('supplierLedgerModal').style.display = 'none';
}

async function handleSupplierPayment(e) {
  e.preventDefault();
  const supplierId = document.getElementById('payoutSupplierId').value;
  const amount = parseFloat(document.getElementById('payoutAmount').value);
  const note = document.getElementById('payoutNote').value;

  const res = await fetch(`/api/suppliers/${supplierId}/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, note })
  });

  const data = await res.json();
  if (data.error) {
    alert(data.error);
  } else {
    alert('Payout successfully recorded to supplier ledger!');
    closeSupplierModal();
    await loadSuppliers();
  }
}