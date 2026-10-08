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
    <tr style="${c.is_active === 0 ? 'background:#f8fafc; opacity:0.6;' : ''}">
      <td>
        <strong>${c.name}</strong> ${c.is_active === 0 ? '<span style="color:#dc2626; font-size:0.75rem;">[Deactivated]</span>' : ''}
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
        <div style="display:flex; gap:4px;">
          <button class="btn-action" style="padding:4px 8px; font-size:0.8rem;" onclick='openEditCustomerModal(${JSON.stringify(c)})'>✏️</button>
          <button class="btn-action" style="padding:4px 8px; font-size:0.8rem; background:${c.is_active === 1 ? '#dc2626' : '#16a34a'};" 
                  onclick="toggleCustomerStatus(${c.id}, ${c.is_active})">
            ${c.is_active === 1 ? '🚫' : '✓'}
          </button>
          <button class="btn-action" style="padding:4px 8px; font-size:0.8rem;" onclick="location.href='customer-debts.html'">📖</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openEditCustomerModal(c) {
  document.getElementById('editCustId').value = c.id;
  document.getElementById('editCustName').value = c.name;
  document.getElementById('editCustShopName').value = c.shop_name || '';
  document.getElementById('editCustPhone').value = c.phone || '';
  document.getElementById('editCustSecondaryPhone').value = c.secondary_phone || '';
  document.getElementById('editCustCity').value = c.city || '';
  document.getElementById('editCustCreditLimit').value = c.credit_limit || 0;
  document.getElementById('editCustAddress').value = c.address || '';
  document.getElementById('editCustNotes').value = c.notes || '';
  document.getElementById('editCustomerModal').style.display = 'flex';
}

function closeEditCustomerModal() {
  document.getElementById('editCustomerModal').style.display = 'none';
}

async function handleSaveCustomerEdit(e) {
  e.preventDefault();
  const id = document.getElementById('editCustId').value;
  const payload = {
    name: document.getElementById('editCustName').value,
    shopName: document.getElementById('editCustShopName').value,
    phone: document.getElementById('editCustPhone').value,
    secondaryPhone: document.getElementById('editCustSecondaryPhone').value,
    city: document.getElementById('editCustCity').value,
    creditLimit: parseFloat(document.getElementById('editCustCreditLimit').value) || 0,
    address: document.getElementById('editCustAddress').value,
    notes: document.getElementById('editCustNotes').value
  };

  const res = await fetch(`/api/customers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (data.error) alert(data.error);
  else {
    alert('Customer updated successfully!');
    closeEditCustomerModal();
    await loadCustomerDirectory();
  }
}

async function toggleCustomerStatus(id, currentStatus) {
  const action = currentStatus === 1 ? 'deactivate' : 'activate';
  if (!confirm(`Are you sure you want to ${action} this customer?`)) return;

  const res = await fetch(`/api/customers/${id}/toggle`, { method: 'PATCH' });
  if (res.ok) await loadCustomerDirectory();
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