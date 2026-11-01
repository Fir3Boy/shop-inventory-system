let currentBrandProducts = [];
let selectedProduct = null;

window.addEventListener('DOMContentLoaded', async () => {
  await loadAuditCategories();
  await loadAuditHistory();
});

// ---------------------------------------------------------------------
// 1. CASCADING SELECTION LOGIC
// ---------------------------------------------------------------------

// Step 1: Load Root Categories on page boot
async function loadAuditCategories() {
  const res = await fetch('/api/catalog/categories');
  const categories = await res.json();

  const catSelect = document.getElementById('auditCategorySelect');
  catSelect.innerHTML = '<option value="">-- Choose Category --</option>' + 
    categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

// Step 2: When Category changes -> Populate Brands
async function onAuditCategoryChange() {
  const catId = document.getElementById('auditCategorySelect').value;
  const brandSelect = document.getElementById('auditBrandSelect');
  const prodSelect = document.getElementById('auditProductSelect');

  brandSelect.innerHTML = '<option value="">-- Choose Brand --</option>';
  prodSelect.innerHTML = '<option value="">-- Choose Product SKU --</option>';
  resetProductDisplay();

  if (!catId) return;

  const res = await fetch(`/api/catalog/categories/${catId}/brands`);
  const brands = await res.json();

  if (brands.length === 0) {
    brandSelect.innerHTML = '<option value="">No brands found in this category</option>';
    return;
  }

  brandSelect.innerHTML = '<option value="">-- Choose Brand --</option>' +
    brands.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
}

// Step 3: When Brand changes -> Populate SKUs
async function onAuditBrandChange() {
  const brandId = document.getElementById('auditBrandSelect').value;
  const prodSelect = document.getElementById('auditProductSelect');

  prodSelect.innerHTML = '<option value="">-- Choose Product SKU --</option>';
  resetProductDisplay();

  if (!brandId) return;

  const res = await fetch(`/api/catalog/brands/${brandId}/products`);
  currentBrandProducts = await res.json();

  if (currentBrandProducts.length === 0) {
    prodSelect.innerHTML = '<option value="">No products found under this brand</option>';
    return;
  }

  prodSelect.innerHTML = '<option value="">-- Choose Product SKU --</option>' +
    currentBrandProducts.map(p => `
      <option value="${p.id}">[${p.sku}] ${p.name} (Stock: ${p.stock_spools} Spools)</option>
    `).join('');
}

// Step 4: When Product is selected -> Autofill current stock
function onAuditProductChange() {
  const pId = parseInt(document.getElementById('auditProductSelect').value);
  selectedProduct = currentBrandProducts.find(p => p.id === pId) || null;

  if (!selectedProduct) {
    resetProductDisplay();
    return;
  }

  // Display system stock clearly in both Cartons and Spools
  document.getElementById('txtCurrentStock').value = 
    `📦 ${selectedProduct.stock_cartons} Cartons + ${selectedProduct.loose_spools} Loose Spools (${selectedProduct.stock_spools} Total Spools)`;

  // Autofill physical count boxes with current numbers as starting point
  document.getElementById('inputPhysicalCartons').value = selectedProduct.stock_cartons;
  document.getElementById('inputPhysicalLoose').value = selectedProduct.loose_spools;
  calculatePhysicalTotal();
}

function resetProductDisplay() {
  selectedProduct = null;
  document.getElementById('txtCurrentStock').value = '';
  document.getElementById('inputPhysicalCartons').value = 0;
  document.getElementById('inputPhysicalLoose').value = 0;
  document.getElementById('inputTotalPhysicalSpools').value = 0;
  document.getElementById('txtDiscrepancyPreview').innerText = '';
}

// ---------------------------------------------------------------------
// 2. DISCREPANCY & AUDIT SUBMIT LOGIC
// ---------------------------------------------------------------------

function calculatePhysicalTotal() {
  if (!selectedProduct) return;

  const cartons = parseInt(document.getElementById('inputPhysicalCartons').value) || 0;
  const loose = parseInt(document.getElementById('inputPhysicalLoose').value) || 0;
  const ratio = selectedProduct.spools_per_carton;

  const totalPhysical = (cartons * ratio) + loose;
  document.getElementById('inputTotalPhysicalSpools').value = totalPhysical;

  const diff = totalPhysical - selectedProduct.stock_spools;
  const preview = document.getElementById('txtDiscrepancyPreview');
  const estLoss = Math.abs(diff) * selectedProduct.cost_price_spool;

  if (diff < 0) {
    preview.style.color = '#dc2626';
    preview.innerText = `⚠️ Deficit: ${Math.abs(diff)} Spools MISSING or DAMAGED. Estimated Loss: -$${estLoss.toFixed(2)}`;
  } else if (diff > 0) {
    preview.style.color = '#16a34a';
    preview.innerText = `➕ Surplus: +${diff} Spools EXTRA on shelf. Stock value will increase by +$${estLoss.toFixed(2)}`;
  } else {
    preview.style.color = '#64748b';
    preview.innerText = `✓ Counts match exactly. No inventory adjustment needed.`;
  }
}

async function handleAuditSubmit(e) {
  e.preventDefault();
  if (!selectedProduct) return;

  const physicalSpools = parseInt(document.getElementById('inputTotalPhysicalSpools').value);
  const diff = physicalSpools - selectedProduct.stock_spools;

  if (diff === 0) {
    alert('Physical count matches system stock. No adjustment needed.');
    return;
  }

  const promptMsg = diff < 0 
    ? `Confirm writing off ${Math.abs(diff)} spools as damaged/missing?`
    : `Confirm adding +${diff} extra spools to inventory?`;

  if (!confirm(promptMsg)) return;

  const payload = {
    productId: selectedProduct.id,
    physicalSpools: physicalSpools,
    adjustmentType: document.getElementById('selectAdjustmentType').value,
    notes: document.getElementById('inputAuditNotes').value
  };

  const res = await fetch('/api/adjustments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (data.error) {
    alert(data.error);
  } else {
    alert('Inventory audit logged and stock updated successfully!');
    document.getElementById('inputAuditNotes').value = '';
    
    // Refresh current brand products to get the updated stock
    await onAuditBrandChange();
    document.getElementById('auditProductSelect').value = selectedProduct.id;
    onAuditProductChange();

    await loadAuditHistory();
  }
}

// ---------------------------------------------------------------------
// 3. AUDIT HISTORY & LOSS LOG
// ---------------------------------------------------------------------

async function loadAuditHistory() {
  const res = await fetch('/api/adjustments');
  const data = await res.json();

  document.getElementById('printMetaDetails').innerText = 
    `Generated: ${new Date().toLocaleString()}`;

  const sum = data.summary || {};
  document.getElementById('auditKpis').innerHTML = `
    <div class="kpi-card" style="border-left: 4px solid #dc2626;">
      <div class="kpi-label">Total Written-Off Loss ($)</div>
      <div class="kpi-value" style="color:#dc2626;">$${(sum.total_financial_loss || 0).toFixed(2)}</div>
    </div>
    <div class="kpi-card" style="border-left: 4px solid #ea580c;">
      <div class="kpi-label">Damaged / Missing Spools</div>
      <div class="kpi-value" style="color:#ea580c;">-${sum.total_lost_spools || 0} Spools</div>
    </div>
    <div class="kpi-card" style="border-left: 4px solid #16a34a;">
      <div class="kpi-label">Found Extra Spools</div>
      <div class="kpi-value profit">+${sum.total_found_spools || 0} Spools</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Audits Completed</div>
      <div class="kpi-value">${sum.total_audits || 0}</div>
    </div>
  `;

  const tbody = document.getElementById('auditTableBody');
  if (!data.rows || data.rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; color:#64748b;">No stock adjustments recorded yet.</td></tr>';
    return;
  }

  tbody.innerHTML = data.rows.map(r => {
    const isLoss = r.delta_spools < 0;
    return `
      <tr>
        <td>${new Date(r.adjusted_at).toLocaleDateString()}</td>
        <td><strong>${r.product_name}</strong><br><small><code>${r.sku}</code> (${r.brand_name})</small></td>
        <td><span style="font-weight:700; font-size:0.8rem;">${r.adjustment_type}</span></td>
        <td>${r.system_spools} Sp</td>
        <td>${r.physical_spools} Sp</td>
        <td style="font-weight:800; color:${isLoss ? '#dc2626' : '#16a34a'};">
          ${r.delta_spools > 0 ? '+' : ''}${r.delta_spools} Spools
        </td>
        <td style="font-weight:700; color:${isLoss ? '#dc2626' : '#64748b'};">
          ${isLoss ? `$${r.total_loss_value.toFixed(2)}` : '$0.00'}
        </td>
        <td><small>${r.notes || '-'}</small></td>
      </tr>
    `;
  }).join('');
}