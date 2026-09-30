let allCustomers = [];

window.addEventListener('DOMContentLoaded', async () => {
  await loadCustomerDirectory();
});

async function loadCustomerDirectory() {
  const res = await fetch('/api/customers');
  const data = await res.json();
  allCustomers = data.customers || [];

  document.getElementById('custCountBadge').innerText = `Total: ${allCustomers.length}`;
  renderCustomerTable(allCustomers);
}

function renderCustomerTable(customers) {
  const tbody = document.getElementById('customersDirectoryBody');
  if (!customers || customers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:#64748b;">No customers found.</td></tr>';
    return;
  }

  tbody.innerHTML = customers.map(c => `
    <tr>
      <td>
        <strong>${c.name}</strong>
        ${c.shop_name ? `<br><small style="color:#2563eb; font-weight:600;">🏪 ${c.shop_name}</small>` : ''}
      </td>
      <td>
        📞 ${c.phone || '-'}
        ${c.secondary_phone ? `<br><small style="color:#16a34a;">💬 WA: ${c.secondary_phone}</small>` : ''}
      </td>
      <td>${c.city || c.address || '-'}</td>
      <td>${c.credit_limit > 0 ? `$${c.credit_limit.toFixed(2)}` : '<span style="color:#64748b;">No Limit</span>'}</td>
      <td style="font-weight:800; font-size:1.05rem; color:${c.current_balance > 0 ? '#16a34a' : '#64748b'};">
        $${c.current_balance.toFixed(2)}
      </td>
      <td>
        <button class="btn-action" style="padding:6px 10px; font-size:0.8rem;" 
                onclick="location.href='customer-debts.html'">
          📖 Khaata
        </button>
      </td>
    </tr>
  `).join('');
}

function filterCustomerList() {
  const query = document.getElementById('searchCustomerInput').value.toLowerCase().trim();
  if (!query) {
    renderCustomerTable(allCustomers);
    return;
  }

  const filtered = allCustomers.filter(c => 
    (c.name && c.name.toLowerCase().includes(query)) ||
    (c.shop_name && c.shop_name.toLowerCase().includes(query)) ||
    (c.phone && c.phone.includes(query)) ||
    (c.secondary_phone && c.secondary_phone.includes(query)) ||
    (c.city && c.city.toLowerCase().includes(query))
  );

  renderCustomerTable(filtered);
}

async function handleCreateCustomer(e) {
  e.preventDefault();

  const payload = {
    name: document.getElementById('custName').value,
    shopName: document.getElementById('custShopName').value,
    phone: document.getElementById('custPhone').value,
    secondaryPhone: document.getElementById('custSecondaryPhone').value,
    city: document.getElementById('custCity').value,
    creditLimit: parseFloat(document.getElementById('custCreditLimit').value) || 0,
    address: document.getElementById('custAddress').value,
    openingBalance: parseFloat(document.getElementById('custOpeningBalance').value) || 0,
    notes: document.getElementById('custNotes').value
  };

  const res = await fetch('/api/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (data.error) {
    alert(`Failed: ${data.error}`);
  } else {
    alert('Customer successfully registered!');
    e.target.reset();
    document.getElementById('custCreditLimit').value = '0.00';
    document.getElementById('custOpeningBalance').value = '0.00';
    await loadCustomerDirectory();
  }
}