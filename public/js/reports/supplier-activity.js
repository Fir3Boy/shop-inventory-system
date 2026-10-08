window.addEventListener('DOMContentLoaded', async () => {
  setPreset('month');
  await loadDropdowns();
  await fetchSupplierReport();
});

function setPreset(preset) {
  const start = document.getElementById('filterStartDate');
  const end = document.getElementById('filterEndDate');
  const today = new Date();
  const toStr = (d) => d.toISOString().split('T')[0];

  if (preset === 'today') {
    start.value = toStr(today);
    end.value = toStr(today);
  } else if (preset === 'week') {
    const monday = new Date(today);
    monday.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));
    start.value = toStr(monday);
    end.value = toStr(today);
  } else if (preset === 'month') {
    start.value = toStr(new Date(today.getFullYear(), today.getMonth(), 1));
    end.value = toStr(today);
  } else if (preset === 'all') {
    start.value = '';
    end.value = '';
  }

  fetchSupplierReport();
}

async function loadDropdowns() {
  const resS = await fetch('/api/parties?type=SUPPLIER');
  const suppliers = await resS.json();
  const supSelect = document.getElementById('filterSupplierSelect');
  suppliers.forEach(s => {
    const label = s.shop_name ? `🏭 ${s.shop_name} (Rep: ${s.name})` : s.name;
    supSelect.innerHTML += `<option value="${s.id}">${label}</option>`;
  });

  const resCat = await fetch('/api/catalog/categories');
  const categories = await resCat.json();
  const catSelect = document.getElementById('filterCategorySelect');
  categories.forEach(c => catSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`);
}

async function onCategoryChange() {
  const catId = document.getElementById('filterCategorySelect').value;
  const brandSelect = document.getElementById('filterBrandSelect');
  const prodSelect = document.getElementById('filterProductSelect');

  brandSelect.innerHTML = '<option value="">-- All Brands --</option>';
  prodSelect.innerHTML = '<option value="">-- All Products --</option>';

  if (!catId) return;
  const res = await fetch(`/api/catalog/categories/${catId}/brands`);
  const brands = await res.json();
  brands.forEach(b => brandSelect.innerHTML += `<option value="${b.id}">${b.name}</option>`);
}

async function onBrandChange() {
  const brandId = document.getElementById('filterBrandSelect').value;
  const prodSelect = document.getElementById('filterProductSelect');
  prodSelect.innerHTML = '<option value="">-- All Products --</option>';

  if (!brandId) return;
  const res = await fetch(`/api/catalog/brands/${brandId}/products`);
  const prods = await res.json();
  prods.forEach(p => prodSelect.innerHTML += `<option value="${p.id}">[${p.sku}] ${p.name}</option>`);
}

async function fetchSupplierReport() {
  const params = new URLSearchParams();
  const s = document.getElementById('filterStartDate').value;
  const e = document.getElementById('filterEndDate').value;
  const sup = document.getElementById('filterSupplierSelect').value;
  const cat = document.getElementById('filterCategorySelect').value;
  const b = document.getElementById('filterBrandSelect').value;
  const p = document.getElementById('filterProductSelect').value;

  if (s) params.append('startDate', s);
  if (e) params.append('endDate', e);
  if (sup) params.append('supplierId', sup);
  if (cat) params.append('categoryId', cat);
  if (b) params.append('brandId', b);
  if (p) params.append('productId', p);

  const res = await fetch(`/api/reports/supplier-activity?${params.toString()}`);
  const data = await res.json();

  document.getElementById('printMetaDetails').innerText = 
    `Period: ${s || 'All'} to ${e || 'Today'} | Printed: ${new Date().toLocaleString()}`;

  const sum = data.summary || {};
  document.getElementById('supplierKpis').innerHTML = `
    <div class="kpi-card" style="border-left: 4px solid #7c3aed;">
      <div class="kpi-label">Total Inward Purchases</div>
      <div class="kpi-value" style="color:#7c3aed;">$${(sum.total_inward_cost || 0).toFixed(2)}</div>
    </div>
    <div class="kpi-card" style="border-left: 4px solid #16a34a;">
      <div class="kpi-label">Total Physical Spools Received</div>
      <div class="kpi-value profit">${sum.total_spools_received || 0} Spools</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Mill Consignments Received</div>
      <div class="kpi-value">${sum.total_bills || 0}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Line Items Processed</div>
      <div class="kpi-value">${sum.total_items_count || 0}</div>
    </div>
  `;

  const tbody = document.getElementById('supplierTableBody');
  if (!data.rows || data.rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:30px; color:#64748b;">No inward supplier consignments found for this filter.</td></tr>';
    return;
  }

  tbody.innerHTML = data.rows.map(r => `
    <tr>
      <td>${r.purchase_date}</td>
      <td><strong>${r.invoice_number}</strong></td>
      <td>${r.mill_bill_ref ? `<span style="font-weight:700; color:#475569;">${r.mill_bill_ref}</span>` : '<span style="color:#94a3b8;">-</span>'}</td>
      <td>
        <strong>${r.mill_name || r.rep_name}</strong>
        ${r.mill_name ? `<br><small style="color:#64748b;">Rep: ${r.rep_name}</small>` : ''}
      </td>
      <td>
        <strong>${r.product_name}</strong>
        <br><small style="color:#64748b;">SKU: ${r.sku} (${r.brand_name})</small>
      </td>
      <td>${r.quantity} ${r.unit}</td>
      <td><strong style="color:#16a34a;">+${r.base_quantity_spools} Spools</strong></td>
      <td>$${r.unit_price.toFixed(2)}</td>
      <td><strong style="color:#7c3aed;">$${r.line_total.toFixed(2)}</strong></td>
    </tr>
  `).join('');
}