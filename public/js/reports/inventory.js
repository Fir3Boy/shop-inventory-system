window.addEventListener('DOMContentLoaded', async () => {
  const res = await fetch('/api/reports/inventory-valuation');
  const data = await res.json();
  const s = data.summary || {};

  document.getElementById('printMetaDetails').innerText = 
    `Stock Snapshot | Date: ${new Date().toLocaleString()}`;

  document.getElementById('invKpis').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Active SKUs</div>
      <div class="kpi-value">${s.total_skus || 0}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Total Spools on Hand</div>
      <div class="kpi-value">${s.total_spools_on_hand || 0}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Asset Worth (Cost Value)</div>
      <div class="kpi-value profit">$${(s.total_asset_cost_value || 0).toFixed(2)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Expected Retail Worth</div>
      <div class="kpi-value sales">$${(s.total_expected_sales_value || 0).toFixed(2)}</div>
    </div>
  `;

  const tbody = document.getElementById('invTableBody');
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
});