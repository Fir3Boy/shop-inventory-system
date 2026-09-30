window.addEventListener('DOMContentLoaded', async () => {
  setPreset('month');
  await loadDropdowns();
  await fetchSalesReport();
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

  fetchSalesReport();
}

async function loadDropdowns() {
  const resP = await fetch('/api/parties?type=CUSTOMER');
  const parties = await resP.json();
  const cSelect = document.getElementById('filterCustomerSelect');
  parties.forEach(p => cSelect.innerHTML += `<option value="${p.id}">${p.name}</option>`);

  const resC = await fetch('/api/catalog/categories');
  const categories = await resC.json();
  const catSelect = document.getElementById('filterCategorySelect');
  categories.forEach(c => catSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`);
}

async function onCategoryChange() {
  const catId = document.getElementById('filterCategorySelect').value;
  const brandSelect = document.getElementById('filterBrandSelect');
  brandSelect.innerHTML = '<option value="">-- All Brands --</option>';

  if (!catId) return;
  const res = await fetch(`/api/catalog/categories/${catId}/brands`);
  const brands = await res.json();
  brands.forEach(b => brandSelect.innerHTML += `<option value="${b.id}">${b.name}</option>`);
}

async function fetchSalesReport() {
  const params = new URLSearchParams();
  const s = document.getElementById('filterStartDate').value;
  const e = document.getElementById('filterEndDate').value;
  const p = document.getElementById('filterCustomerSelect').value;
  const c = document.getElementById('filterCategorySelect').value;
  const b = document.getElementById('filterBrandSelect').value;

  if (s) params.append('startDate', s);
  if (e) params.append('endDate', e);
  if (p) params.append('partyId', p);
  if (c) params.append('categoryId', c);
  if (b) params.append('brandId', b);

  const res = await fetch(`/api/reports/sales?${params.toString()}`);
  const data = await res.json();

  document.getElementById('printMetaDetails').innerText = 
    `Period: ${s || 'All'} to ${e || 'Today'} | Generated: ${new Date().toLocaleString()}`;

  const sum = data.summary || {};
  document.getElementById('salesKpis').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Gross Sales Revenue</div>
      <div class="kpi-value sales">$${(sum.gross_sales || 0).toFixed(2)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Total Gross Profit</div>
      <div class="kpi-value profit">$${(sum.gross_profit || 0).toFixed(2)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Completed Invoices</div>
      <div class="kpi-value">${sum.total_invoices || 0}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Spools Sold (Base Volume)</div>
      <div class="kpi-value">${sum.total_spools_sold || 0}</div>
    </div>
  `;

  const tbody = document.getElementById('salesTableBody');
  if (!data.rows || data.rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:30px; color:#64748b;">No sales records found for this period.</td></tr>';
    return;
  }

  tbody.innerHTML = data.rows.map(r => `
    <tr>
      <td>${r.sale_date}</td>
      <td><strong>${r.invoice_number}</strong></td>
      <td>${r.customer_name}</td>
      <td>${r.product_name} <br><small style="color:#64748b;">${r.sku}</small></td>
      <td>${r.unit}</td>
      <td>${r.quantity}</td>
      <td>$${r.unit_price.toFixed(2)}</td>
      <td><strong>$${r.line_total.toFixed(2)}</strong></td>
      <td style="color:${r.item_profit >= 0 ? '#16a34a' : '#dc2626'}; font-weight:700;">
        $${r.item_profit.toFixed(2)}
      </td>
    </tr>
  `).join('');
}