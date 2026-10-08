window.addEventListener('DOMContentLoaded', async () => {
  setPreset('month');
  await loadFilterDropdowns();
  await fetchMovementReport();
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

  fetchMovementReport();
}

async function loadFilterDropdowns() {
  const resC = await fetch('/api/catalog/categories');
  const categories = await resC.json();
  const catSelect = document.getElementById('filterCategorySelect');
  categories.forEach(c => catSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`);
}

async function onCategoryChange() {
  const catId = document.getElementById('filterCategorySelect').value;
  const brandSelect = document.getElementById('filterBrandSelect');
  const prodSelect = document.getElementById('filterProductSelect');
  
  brandSelect.innerHTML = '<option value="">-- All Brands --</option>';
  prodSelect.innerHTML = '<option value="">-- All SKUs --</option>';

  if (!catId) return;
  const res = await fetch(`/api/catalog/categories/${catId}/brands`);
  const brands = await res.json();
  brands.forEach(b => brandSelect.innerHTML += `<option value="${b.id}">${b.name}</option>`);
}

async function onBrandChange() {
  const brandId = document.getElementById('filterBrandSelect').value;
  const prodSelect = document.getElementById('filterProductSelect');
  prodSelect.innerHTML = '<option value="">-- All SKUs --</option>';

  if (!brandId) return;
  const res = await fetch(`/api/catalog/brands/${brandId}/products`);
  const products = await res.json();
  products.forEach(p => prodSelect.innerHTML += `<option value="${p.id}">[${p.sku}] ${p.name}</option>`);
}

async function fetchMovementReport() {
  const params = new URLSearchParams();
  const s = document.getElementById('filterStartDate').value;
  const e = document.getElementById('filterEndDate').value;
  const m = document.getElementById('filterMovementType').value;
  const c = document.getElementById('filterCategorySelect').value;
  const b = document.getElementById('filterBrandSelect').value;
  const p = document.getElementById('filterProductSelect').value;

  if (s) params.append('startDate', s);
  if (e) params.append('endDate', e);
  if (m) params.append('movementType', m);
  if (c) params.append('categoryId', c);
  if (b) params.append('brandId', b);
  if (p) params.append('productId', p);

  const res = await fetch(`/api/reports/sku-movements?${params.toString()}`);
  const data = await res.json();

  document.getElementById('printMetaDetails').innerText = 
    `Period: ${s || 'All'} to ${e || 'Today'} | Flow: ${m} | Generated: ${new Date().toLocaleString()}`;

  const sum = data.summary || {};
  const netDelta = (sum.total_in_spools || 0) - (sum.total_out_spools || 0);

  // Render KPI Metrics
  document.getElementById('movementKpis').innerHTML = `
    <div class="kpi-card" style="border-left: 4px solid #7c3aed;">
      <div class="kpi-label">Stock IN (Purchased Inflow)</div>
      <div class="kpi-value" style="color:#7c3aed;">+${sum.total_in_spools || 0} Spools</div>
    </div>
    <div class="kpi-card" style="border-left: 4px solid #2563eb;">
      <div class="kpi-label">Stock OUT (Sold Outflow)</div>
      <div class="kpi-value sales">-${sum.total_out_spools || 0} Spools</div>
    </div>
    <div class="kpi-card" style="border-left: 4px solid ${netDelta >= 0 ? '#16a34a' : '#dc2626'};">
      <div class="kpi-label">Net Inventory Delta</div>
      <div class="kpi-value" style="color:${netDelta >= 0 ? '#16a34a' : '#dc2626'};">
        ${netDelta >= 0 ? '+' : ''}${netDelta} Spools
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Total Transactions Logged</div>
      <div class="kpi-value">${sum.total_movements || 0}</div>
    </div>
  `;

  // Render Table Rows
  const tbody = document.getElementById('movementsTableBody');
  if (!data.rows || data.rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:30px; color:#64748b;">No stock movements found matching this filter.</td></tr>';
    return;
  }

  tbody.innerHTML = data.rows.map(r => {
    const isPurchase = r.movement_type === 'IN';
    const badgeStyle = isPurchase 
      ? 'background:#f5f3ff; color:#6d28d9; border: 1px solid #ddd6fe;' 
      : 'background:#eff6ff; color:#1d4ed8; border: 1px solid #bfdbfe;';
    const impactColor = isPurchase ? '#16a34a' : '#dc2626';
    const impactSign = isPurchase ? '+' : '-';

    return `
      <tr>
        <td>${r.move_date}</td>
        <td>
          <span style="font-weight:700; font-size:0.75rem; padding:3px 6px; border-radius:4px; ${badgeStyle}">
            ${isPurchase ? '📥 IN (Purchase)' : '📤 OUT (Sale)'}
          </span>
        </td>
        <td>
          <strong>${r.invoice_number}</strong>
          ${r.invoice_ref ? `<br><small style="color:#64748b;">Ref: ${r.invoice_ref}</small>` : ''}
        </td>
        <td>${r.party_name}</td>
        <td>
          <strong>${r.product_name}</strong>
          <br><small style="color:#64748b;">SKU: ${r.sku} (${r.brand_name})</small>
        </td>
        <td>${r.quantity} ${r.unit}</td>
        <td style="font-weight:800; font-size:1rem; color:${impactColor};">
          ${impactSign}${r.base_quantity_spools} Spools
        </td>
        <td>$${r.unit_price.toFixed(2)}</td>
        <td><strong>$${r.line_total.toFixed(2)}</strong></td>
      </tr>
    `;
  }).join('');
}