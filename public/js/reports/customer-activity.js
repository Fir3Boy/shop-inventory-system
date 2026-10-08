window.addEventListener('DOMContentLoaded', async () => {
  setPreset('month');
  await loadDropdowns();
  await fetchCustomerReport();
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

  fetchCustomerReport();
}

async function loadDropdowns() {
  const resC = await fetch('/api/parties?type=CUSTOMER');
  const customers = await resC.json();
  const custSelect = document.getElementById('filterCustomerSelect');
  customers.forEach(c => {
    const label = c.shop_name ? `🏪 ${c.shop_name} (${c.name})` : c.name;
    custSelect.innerHTML += `<option value="${c.id}">${label}</option>`;
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

async function fetchCustomerReport() {
  const params = new URLSearchParams();
  const s = document.getElementById('filterStartDate').value;
  const e = document.getElementById('filterEndDate').value;
  const cust = document.getElementById('filterCustomerSelect').value;
  const cat = document.getElementById('filterCategorySelect').value;
  const b = document.getElementById('filterBrandSelect').value;
  const p = document.getElementById('filterProductSelect').value;

  if (s) params.append('startDate', s);
  if (e) params.append('endDate', e);
  if (cust) params.append('customerId', cust);
  if (cat) params.append('categoryId', cat);
  if (b) params.append('brandId', b);
  if (p) params.append('productId', p);

  const res = await fetch(`/api/reports/customer-activity?${params.toString()}`);
  const data = await res.json();

  document.getElementById('printMetaDetails').innerText = 
    `Period: ${s || 'All'} to ${e || 'Today'} | Printed: ${new Date().toLocaleString()}`;

  const sum = data.summary || {};
  document.getElementById('customerKpis').innerHTML = `
    <div class="kpi-card" style="border-left: 4px solid #2563eb;">
      <div class="kpi-label">Total Amount Billed</div>
      <div class="kpi-value sales">$${(sum.total_amount_billed || 0).toFixed(2)}</div>
    </div>
    <div class="kpi-card" style="border-left: 4px solid #16a34a;">
      <div class="kpi-label">Total Physical Spools Sold</div>
      <div class="kpi-value profit">${sum.total_spools_sold || 0} Spools</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Invoices Completed</div>
      <div class="kpi-value">${sum.total_invoices || 0}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Items Transacted</div>
      <div class="kpi-value">${sum.total_items_count || 0}</div>
    </div>
  `;

  const tbody = document.getElementById('customerTableBody');
  if (!data.rows || data.rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; color:#64748b;">No customer sales found for this filter.</td></tr>';
    return;
  }

  tbody.innerHTML = data.rows.map(r => `
    <tr>
      <td>${r.sale_date}</td>
      <td>
        <strong>${r.invoice_number}</strong>
        ${r.invoice_ref ? `<br><small style="color:#64748b;">Ref: ${r.invoice_ref}</small>` : ''}
      </td>
      <td>
        <strong>${r.customer_shop || r.customer_name}</strong>
        ${r.customer_shop ? `<br><small style="color:#64748b;">Contact: ${r.customer_name}</small>` : ''}
      </td>
      <td>
        <strong>${r.product_name}</strong>
        <br><small style="color:#64748b;">SKU: ${r.sku} (${r.brand_name})</small>
      </td>
      <td>${r.quantity} ${r.unit}</td>
      <td><strong>${r.base_quantity_spools} Spools</strong></td>
      <td>$${r.unit_price.toFixed(2)}</td>
      <td><strong style="color:#2563eb;">$${r.line_total.toFixed(2)}</strong></td>
    </tr>
  `).join('');
}