let allSuppliers = [];

window.addEventListener('DOMContentLoaded', async () => {
  await loadSuppliers();
});

async function loadSuppliers() {
  const res = await fetch('/api/suppliers');
  const data = await res.json();
  allSuppliers = data.suppliers || [];

  document.getElementById('txtTotalPayable').innerText = `SAR ${data.totalPayable.toFixed(2)}`;
  
  const pendingCount = allSuppliers.filter(s => s.current_balance < 0).length;
  document.getElementById('txtSupplierCount').innerText = pendingCount;

  filterSuppliersTable();
}

function filterSuppliersTable() {
  const query = document.getElementById('searchSupplierInput').value.toLowerCase().trim();
  const filterStatus = document.getElementById('filterSupplierStatus').value;

  const filtered = allSuppliers.filter(s => {
    // 1. Search text filter
    const matchesSearch = !query ||
      (s.name && s.name.toLowerCase().includes(query)) ||
      (s.shop_name && s.shop_name.toLowerCase().includes(query)) ||
      (s.phone && s.phone.includes(query)) ||
      (s.secondary_phone && s.secondary_phone.includes(query)) ||
      (s.city && s.city.toLowerCase().includes(query));

    // 2. Payable balance filter (negative balance = we owe them)
    const matchesPayable = (filterStatus === 'PAYABLE_ONLY') ? s.current_balance < 0 : true;

    return matchesSearch && matchesPayable;
  });

  document.getElementById('txtSupplierSearchCount').innerText = `Showing: ${filtered.length} of ${allSuppliers.length}`;
  renderSupplierRows(filtered);
}

function renderSupplierRows(suppliers) {
  const tbody = document.getElementById('suppliersTableBody');
  if (!suppliers || suppliers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:#64748b;">No matching supplier records found.</td></tr>';
    return;
  }

  tbody.innerHTML = suppliers.map(s => {
    const owed = s.current_balance < 0 ? Math.abs(s.current_balance) : 0;
    return `
      <tr>
        <td>
          <strong>${s.shop_name || s.name}</strong>
          ${s.shop_name ? `<br><small style="color:#64748b;">Rep: ${s.name}</small>` : ''}
        </td>
        <td>
          📞 ${s.phone || '-'}
          ${s.secondary_phone ? `<br><small style="color:#16a34a;">💬 WA: ${s.secondary_phone}</small>` : ''}
        </td>
        <td>${s.city || '-'}</td>
        <td style="font-weight:800; font-size:1.1rem; color: ${owed > 0 ? '#dc2626' : '#64748b'};">
          SAR ${owed.toFixed(2)}
        </td>
        <td class="no-print" style="text-align:right;">
          <button class="btn-action" style="padding:8px 14px; font-size:0.9rem; font-weight:bold; background:#7c3aed;" 
                  onclick="openSupplierLedger(${s.id})">
            🏭 Record Payout / Statement
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
  const title = data.supplier.shop_name 
    ? `${data.supplier.shop_name} (Rep: ${data.supplier.name})` 
    : data.supplier.name;

  document.getElementById('modalSupplierTitle').innerText = 
    `${title} — Amount You Owe: SAR ${owed.toFixed(2)}`;

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
        <td>SAR ${e.amount.toFixed(2)}</td>
        <td><strong>SAR ${Math.abs(e.balance_after).toFixed(2)}</strong></td>
      </tr>
    `).join('');
  }

  document.getElementById('supplierLedgerModal').style.display = 'flex';
  setTimeout(() => document.getElementById('payoutAmount').focus(), 100);
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