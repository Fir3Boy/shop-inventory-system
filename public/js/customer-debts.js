window.addEventListener('DOMContentLoaded', async () => {
  await loadCustomers();
});

async function loadCustomers() {
  const res = await fetch('/api/customers');
  const data = await res.json();

  document.getElementById('txtTotalReceivable').innerText = `$${data.totalReceivable.toFixed(2)}`;
  
  const debtors = data.customers.filter(c => c.current_balance > 0);
  document.getElementById('txtDebtorCount').innerText = debtors.length;

  const tbody = document.getElementById('customersTableBody');
  if (data.customers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:#64748b;">No customers registered.</td></tr>';
    return;
  }

  tbody.innerHTML = data.customers.map(c => `
    <tr>
      <td><strong>${c.name}</strong></td>
      <td>${c.phone || '-'}</td>
      <td><small style="color:#64748b;">${c.address || '-'}</small></td>
      <td style="font-weight:800; font-size:1.1rem; color: ${c.current_balance > 0 ? '#16a34a' : '#64748b'};">
        $${c.current_balance.toFixed(2)}
      </td>
      <td class="no-print" style="text-align:right;">
        <button class="btn-action" style="padding:6px 12px; font-size:0.85rem;" 
                onclick="openCustomerLedger(${c.id})">
          📖 View Statement / Collect
        </button>
      </td>
    </tr>
  `).join('');
}

async function openCustomerLedger(customerId) {
  const res = await fetch(`/api/customers/${customerId}/ledger`);
  const data = await res.json();

  document.getElementById('modalCustomerTitle').innerText = 
    `${data.customer.name} (Current Debt: $${data.customer.current_balance.toFixed(2)})`;
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