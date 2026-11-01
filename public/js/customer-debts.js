let allDebtors = [];

window.addEventListener('DOMContentLoaded', async () => {
  await loadCustomers();
});

async function loadCustomers() {
  const res = await fetch('/api/customers');
  const data = await res.json();
  allDebtors = data.customers || [];

  document.getElementById('txtTotalReceivable').innerText = `$${data.totalReceivable.toFixed(2)}`;
  
  const debtorsCount = allDebtors.filter(c => c.current_balance > 0).length;
  document.getElementById('txtDebtorCount').innerText = debtorsCount;

  filterDebtorsTable();
}

function filterDebtorsTable() {
  const query = document.getElementById('searchDebtorInput').value.toLowerCase().trim();
  const filterStatus = document.getElementById('filterDebtorStatus').value;

  const filtered = allDebtors.filter(c => {
    // 1. Text filter across all identifiers
    const matchesSearch = !query ||
      (c.name && c.name.toLowerCase().includes(query)) ||
      (c.shop_name && c.shop_name.toLowerCase().includes(query)) ||
      (c.phone && c.phone.includes(query)) ||
      (c.secondary_phone && c.secondary_phone.includes(query)) ||
      (c.city && c.city.toLowerCase().includes(query));

    // 2. Status balance filter
    const matchesBalance = (filterStatus === 'DEBT_ONLY') ? c.current_balance > 0 : true;

    return matchesSearch && matchesBalance;
  });

  document.getElementById('txtSearchCount').innerText = `Showing: ${filtered.length} of ${allDebtors.length}`;
  renderCustomerRows(filtered);
}

function renderCustomerRows(customers) {
  const tbody = document.getElementById('customersTableBody');
  if (!customers || customers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:#64748b;">No matching customer records found.</td></tr>';
    return;
  }

  tbody.innerHTML = customers.map(c => `
    <tr>
      <td>
        <strong>${c.name}</strong>
        ${c.shop_name ? `<br><small style="color:#2563eb; font-weight:700;">🏪 ${c.shop_name}</small>` : ''}
      </td>
      <td>
        📞 ${c.phone || '-'}
        ${c.secondary_phone ? `<br><small style="color:#16a34a;">💬 WA: ${c.secondary_phone}</small>` : ''}
      </td>
      <td>${c.city || c.address || '-'}</td>
      <td style="font-weight:800; font-size:1.1rem; color: ${c.current_balance > 0 ? '#16a34a' : '#64748b'};">
        $${c.current_balance.toFixed(2)}
      </td>
      <td class="no-print" style="text-align:right;">
        <button class="btn-action" style="padding:8px 14px; font-size:0.9rem; font-weight:bold; background:#16a34a;" 
                onclick="openCustomerLedger(${c.id})">
          💵 Settle Cash / Statement
        </button>
      </td>
    </tr>
  `).join('');
}

async function openCustomerLedger(customerId) {
  const res = await fetch(`/api/customers/${customerId}/ledger`);
  const data = await res.json();

  const title = data.customer.shop_name 
    ? `${data.customer.shop_name} (${data.customer.name})` 
    : data.customer.name;

  document.getElementById('modalCustomerTitle').innerText = 
    `${title} — Current Debt: $${data.customer.current_balance.toFixed(2)}`;
    
  document.getElementById('collectCustomerId').value = customerId;
  document.getElementById('collectAmount').value = '';
  document.getElementById('collectNote').value = '';

  const tbody = document.getElementById('modalLedgerLogs');
  if (data.entries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No transaction records.</td></tr>';
  } else {
    tbody.innerHTML = data.entries.map(e => `
      <tr>
        <td><small>${new Date(e.created_at).toLocaleDateString()}</small></td>
        <td>${e.description}</td>
        <td><span style="font-weight:bold; color:${e.entry_type === 'DEBIT' ? '#dc2626' : '#16a34a'}">${e.entry_type}</span></td>
        <td>$${e.amount.toFixed(2)}</td>
        <td><strong>$${e.balance_after.toFixed(2)}</strong></td>
      </tr>
    `).join('');
  }

  document.getElementById('customerLedgerModal').style.display = 'flex';
  // Auto-focus amount box for fast typing
  setTimeout(() => document.getElementById('collectAmount').focus(), 100);
}

function closeCustomerModal() {
  document.getElementById('customerLedgerModal').style.display = 'none';
}

async function handleCustomerPayment(e) {
  e.preventDefault();
  const customerId = document.getElementById('collectCustomerId').value;
  const amount = parseFloat(document.getElementById('collectAmount').value);
  const note = document.getElementById('collectNote').value;

  const res = await fetch(`/api/customers/${customerId}/collect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, note })
  });

  const data = await res.json();
  if (data.error) {
    alert(data.error);
  } else {
    alert('Payment successfully credited to customer ledger!');
    closeCustomerModal();
    await loadCustomers();
  }
}