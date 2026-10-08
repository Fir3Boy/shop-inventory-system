let allSuppliers = [];

window.addEventListener('DOMContentLoaded', async () => {
  await loadSupplierDirectory();
});

async function loadSupplierDirectory() {
  const res = await fetch('/api/suppliers');
  const data = await res.json();
  allSuppliers = data.suppliers || [];

  document.getElementById('supCountBadge').innerText = `Total: ${allSuppliers.length}`;
  renderSupplierTable(allSuppliers);
}

function renderSupplierTable(suppliers) {
  const tbody = document.getElementById('suppliersDirectoryBody');
  if (!suppliers || suppliers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:#64748b;">No suppliers registered.</td></tr>';
    return;
  }

  tbody.innerHTML = suppliers.map(s => {
    const owed = s.current_balance < 0 ? Math.abs(s.current_balance) : 0;
    return `
      <tr style="${s.is_active === 0 ? 'background:#f8fafc; opacity:0.6;' : ''}">
        <td>
          <strong>${s.shop_name || s.name}</strong> ${s.is_active === 0 ? '<span style="color:#dc2626; font-size:0.75rem;">[Deactivated]</span>' : ''}
          ${s.shop_name ? `<br><small style="color:#64748b;">Rep: ${s.name}</small>` : ''}
        </td>
        <td>
          📞 ${s.phone || '-'}
          ${s.secondary_phone ? `<br><small style="color:#16a34a;">💬 WA: ${s.secondary_phone}</small>` : ''}
        </td>
        <td>${s.city || '-'}</td>
        <td><small style="color:#475569;">${s.notes || '-'}</small></td>
        <td style="font-weight:800; font-size:1.05rem; color:${owed > 0 ? '#dc2626' : '#64748b'};">
          $${owed.toFixed(2)}
        </td>
        <td>
          <div style="display:flex; gap:4px;">
            <button class="btn-action" style="padding:4px 8px; font-size:0.8rem; background:#7c3aed;" onclick='openEditSupplierModal(${JSON.stringify(s)})'>✏️</button>
            <button class="btn-action" style="padding:4px 8px; font-size:0.8rem; background:${s.is_active === 1 ? '#dc2626' : '#16a34a'};" 
                    onclick="toggleSupplierStatus(${s.id}, ${s.is_active})">
              ${s.is_active === 1 ? '🚫' : '✓'}
            </button>
            <button class="btn-action" style="padding:4px 8px; font-size:0.8rem; background:#7c3aed;" onclick="location.href='supplier-debts.html'">🏭</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openEditSupplierModal(s) {
  document.getElementById('editSupId').value = s.id;
  document.getElementById('editSupShopName').value = s.shop_name || '';
  document.getElementById('editSupName').value = s.name;
  document.getElementById('editSupPhone').value = s.phone || '';
  document.getElementById('editSupSecondaryPhone').value = s.secondary_phone || '';
  document.getElementById('editSupCity').value = s.city || '';
  document.getElementById('editSupAddress').value = s.address || '';
  document.getElementById('editSupNotes').value = s.notes || '';
  document.getElementById('editSupplierModal').style.display = 'flex';
}

function closeEditSupplierModal() {
  document.getElementById('editSupplierModal').style.display = 'none';
}

async function handleSaveSupplierEdit(e) {
  e.preventDefault();
  const id = document.getElementById('editSupId').value;
  const payload = {
    shopName: document.getElementById('editSupShopName').value,
    name: document.getElementById('editSupName').value,
    phone: document.getElementById('editSupPhone').value,
    secondaryPhone: document.getElementById('editSupSecondaryPhone').value,
    city: document.getElementById('editSupCity').value,
    address: document.getElementById('editSupAddress').value,
    notes: document.getElementById('editSupNotes').value
  };

  const res = await fetch(`/api/suppliers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (data.error) alert(data.error);
  else {
    alert('Supplier updated successfully!');
    closeEditSupplierModal();
    await loadSupplierDirectory();
  }
}

async function toggleSupplierStatus(id, currentStatus) {
  const action = currentStatus === 1 ? 'deactivate' : 'activate';
  if (!confirm(`Are you sure you want to ${action} this supplier?`)) return;

  const res = await fetch(`/api/suppliers/${id}/toggle`, { method: 'PATCH' });
  if (res.ok) await loadSupplierDirectory();
}
function filterSupplierList() {
  const query = document.getElementById('searchSupplierInput').value.toLowerCase().trim();
  if (!query) {
    renderSupplierTable(allSuppliers);
    return;
  }

  const filtered = allSuppliers.filter(s => 
    (s.name && s.name.toLowerCase().includes(query)) ||
    (s.shop_name && s.shop_name.toLowerCase().includes(query)) ||
    (s.phone && s.phone.includes(query)) ||
    (s.secondary_phone && s.secondary_phone.includes(query)) ||
    (s.city && s.city.toLowerCase().includes(query))
  );

  renderSupplierTable(filtered);
}

async function handleCreateSupplier(e) {
  e.preventDefault();

  const payload = {
    shopName: document.getElementById('supShopName').value,
    name: document.getElementById('supName').value,
    phone: document.getElementById('supPhone').value,
    secondaryPhone: document.getElementById('supSecondaryPhone').value,
    city: document.getElementById('supCity').value,
    address: document.getElementById('supAddress').value,
    openingBalanceOwed: parseFloat(document.getElementById('supOpeningOwed').value) || 0,
    notes: document.getElementById('supNotes').value
  };

  const res = await fetch('/api/suppliers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (data.error) {
    alert(`Failed: ${data.error}`);
  } else {
    alert('Supplier / Mill registered successfully!');
    e.target.reset();
    document.getElementById('supOpeningOwed').value = '0.00';
    await loadSupplierDirectory();
  }
}