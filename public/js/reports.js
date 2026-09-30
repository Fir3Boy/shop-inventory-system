let currentReportType = 'sales';

window.addEventListener('DOMContentLoaded', async () => {
  setPreset('month'); // Default to current month
  await loadFilterDropdowns();
  await loadActiveReport();
});

// Switch between report views
function switchReport(type) {
  currentReportType = type;
  document.getElementById('btnTabSales').className = `report-tab-btn ${type === 'sales' ? 'active' : ''}`;
  document.getElementById('btnTabInventory').className = `report-tab-btn ${type === 'inventory' ? 'active' : ''}`;
  document.getElementById('btnTabDebts').className = `report-tab-btn ${type === 'debts' ? 'active' : ''}`;

  // Filters are only applicable to sales
  document.getElementById('salesFilterCard').style.display = type === 'sales' ? 'block' : 'none';

  loadActiveReport();
}

function loadActiveReport() {
  if (currentReportType === 'sales') loadSalesReport();
  else if (currentReportType === 'inventory') loadInventoryValuationReport();
  else if (currentReportType === 'debts') loadDebtsReport();
}

// ---------------------------------------------------------------------
// 1. DATE PRESET HELPERS
// ---------------------------------------------------------------------
function setPreset(preset) {
  const startInput = document.getElementById('filterStartDate');
  const endInput = document.getElementById('filterEndDate');
  const today = new Date();

  const toDateStr = (d) => d.toISOString().split('T')[0];

  if (preset === 'today') {
    startInput.value = toDateStr(today);
    endInput.value = toDateStr(today);
  } else if (preset === 'week') {
    const monday = new Date(today);
    monday.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));
    startInput.value = toDateStr(monday);
    endInput.value = toDateStr(today);
  } else if (preset === 'month') {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    startInput.value = toDateStr(firstDay);
    endInput.value = toDateStr(today);
  } else if (preset === 'all') {
    startInput.value = '';
    endInput.value = '';
  }

  if (currentReportType === 'sales') loadSalesReport();
}

// ---------------------------------------------------------------------
// 2. LOAD FILTER DROPDOWNS
// ---------------------------------------------------------------------
async function loadFilterDropdowns() {
  // Customers
  const resP = await fetch('/api/parties?type=CUSTOMER');
  const parties = await resP.json();
  const custSelect = document.getElementById('filterCustomerSelect');
  parties.forEach(p => custSelect.innerHTML += `<option value="${p.id}">${p.name}</option>`);

  // Categories
  const resC = await fetch('/api/catalog/categories');
  const categories = await resC.json();
  const catSelect = document.getElementById('filterCategorySelect');
  categories.forEach(c => catSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`);
}

async function onCategoryFilterChange() {
  const catId = document.getElementById('filterCategorySelect').value;
  const brandSelect = document.getElementById('filterBrandSelect');
  brandSelect.innerHTML = '<option value="">-- All Brands --</option>';

  if (!catId) return;
  const res = await fetch(`/api/catalog/categories/${catId}/brands`);
  const brands = await res.json();
  brands.forEach(b => brandSelect.innerHTML += `<option value="${b.id}">${b.name}</option>`);
}

// ---------------------------------------------------------------------
// 3. REPORT 1: SALES & PROFITABILITY
// ---------------------------------------------------------------------
async function loadSalesReport() {
  const params = new URLSearchParams();
  const startDate = document.getElementById('filterStartDate').value;
  const endDate = document.getElementById('filterEndDate').value;
  const partyId = document.getElementById('filterCustomerSelect').value;
  const categoryId = document.getElementById('filterCategorySelect').value;
  const brandId = document.getElementById('filterBrandSelect').value;

  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  if (partyId) params.append('partyId', partyId);
  if (categoryId) params.append('categoryId', categoryId);
  if (brandId) params.append('brandId', brandId);

  const res = await fetch(`/api/reports/sales?${params.toString()}`);
  const data = await res.json();

  document.getElementById('printMetaDetails').innerText = 
    `Period: ${startDate || 'All'} to ${endDate || 'Today'} | Printed: ${new Date().toLocaleString()}`;

  // KPI Cards
  const kpi = document.getElementById('kpiContainer');
  const s = data.summary || {};
  kpi.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Gross Sales Revenue</div>
      <div class="kpi-value sales">$${(s.gross_sales || 0).toFixed(2)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Gross Profit</div>
      <div class="kpi-value profit">$${(s.gross_profit || 0).toFixed(2)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Invoices Completed</div>
      <div class="kpi-value">${s.total_invoices || 0}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Volume Sold (Spools)</div>
      <div class="kpi-value">${s.total_spools_sold || 0}</div>
    </div>
  `;

  // Table
  document.getElementById('reportTableHead').innerHTML = `
    <tr>
      <th>Date</th>
      <th>Invoice #</th>
      <th>Customer</th>
      <th>Product SKU</th>
      <th>Unit</th>
      <th>Qty</th>
      <th>Unit Price</th>
      <th>Total</th>
      <th>Profit</th>
    </tr>
  `;

  const tbody = document.getElementById('reportTableBody');
  if (!data.rows || data.rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:30px; color:#64748b;">No sales records found for this criteria.</td></tr>';
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

// ---------------------------------------------------------------------
// 4. REPORT 2: INVENTORY VALUATION
// ---------------------------------------------------------------------
async function loadInventoryValuationReport() {
  const res = await fetch('/api/reports/inventory-valuation');
  const data = await res.json();
  const s = data.summary || {};

  document.getElementById('printMetaDetails').innerText = 
    `Inventory Valuation Snapshot | Printed: ${new Date().toLocaleString()}`;

  document.getElementById('kpiContainer').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Total SKUs in Catalog</div>
      <div class="kpi-value">${s.total_skus || 0}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Total Spools on Hand</div>
      <div class="kpi-value">${s.total_spools_on_hand || 0}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Asset Value (At Cost)</div>
      <div class="kpi-value profit">$${(s.total_asset_cost_value || 0).toFixed(2)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Retail Value (Expected)</div>
      <div class="kpi-value sales">$${(s.total_expected_sales_value || 0).toFixed(2)}</div>
    </div>
  `;

  document.getElementById('reportTableHead').innerHTML = `
    <tr>
      <th>SKU</th>
      <th>Product</th>
      <th>Category / Brand</th>
      <th>Physical Stock</th>
      <th>Cost / Spool</th>
      <th>Total Cost Value</th>
    </tr>
  `;

  const tbody = document.getElementById('reportTableBody');
  tbody.innerHTML = data.rows.map(r => `
    <tr>
      <td><code>${r.sku}</code></td>
      <td><strong>${r.name}</strong></td>
      <td>${r.category_name} - ${r.brand_name}</td>
      <td>📦 ${r.stock_cartons} Ctn + ${r.loose_spools} Spools</td>
      <td>$${r.cost_price_spool.toFixed(2)}</td>
      <td><strong>$${r.total_inventory_cost.toFixed(2)}</strong></td>
    </tr>
  `).join('');
}

// ---------------------------------------------------------------------
// 5. REPORT 3: DEBT AGING & RECEIVABLES
// ---------------------------------------------------------------------
async function loadDebtsReport() {
  const res = await fetch('/api/reports/debts-summary');
  const data = await res.json();

  document.getElementById('printMetaDetails').innerText = 
    `Debts & Outstanding Balances Summary | Printed: ${new Date().toLocaleString()}`;

  document.getElementById('kpiContainer').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Total Customer Receivables (Owed to Us)</div>
      <div class="kpi-value profit">$${(data.customers.totalReceivable || 0).toFixed(2)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Total Supplier Payables (We Owe)</div>
      <div class="kpi-value" style="color:#dc2626;">$${(data.suppliers.totalPayable || 0).toFixed(2)}</div>
    </div>
  `;

  document.getElementById('reportTableHead').innerHTML = `
    <tr>
      <th>Party Name</th>
      <th>Type</th>
      <th>Phone</th>
      <th>Outstanding Balance</th>
    </tr>
  `;

  const allParties = [
    ...data.customers.list.map(c => ({ ...c, type: 'CUSTOMER (Owes Us)' })),
    ...data.suppliers.list.map(s => ({ ...s, type: 'SUPPLIER (We Owe)', current_balance: Math.abs(s.current_balance) }))
  ];

  const tbody = document.getElementById('reportTableBody');
  tbody.innerHTML = allParties.map(p => `
    <tr>
      <td><strong>${p.name}</strong></td>
      <td>${p.type}</td>
      <td>${p.phone || '-'}</td>
      <td style="font-weight:800; font-size:1.05rem;">$${p.current_balance.toFixed(2)}</td>
    </tr>
  `).join('');
}