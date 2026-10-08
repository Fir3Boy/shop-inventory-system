let rawCatalog = [];
let allCategories = [];

window.addEventListener('DOMContentLoaded', async () => {
  await loadCategories();
  await loadAllProducts();
});

// ---------------------------------------------------------------------
// 1. DROPDOWNS & CASCADE LOGIC
// ---------------------------------------------------------------------

async function loadCategories() {
  const res = await fetch('/api/catalog/categories');
  allCategories = await res.json();

  // Populate Brand Creator category dropdown
  const catSelect = document.getElementById('catSelect');
  catSelect.innerHTML = allCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  // Populate SKU Creator category dropdown
  const skuCatSelect = document.getElementById('skuCategorySelect');
  skuCatSelect.innerHTML = `<option value="">-- Choose Category --</option>` + 
    allCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  // Populate Master Catalog filter category dropdown
  const filterCatSelect = document.getElementById('catalogCategoryFilter');
  filterCatSelect.innerHTML = `<option value="">-- All Categories --</option>` + 
    allCategories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
}

// When Category changes in SKU Creator -> Cascade Brands
async function onSkuCategoryChange() {
  const catId = document.getElementById('skuCategorySelect').value;
  const brandSelect = document.getElementById('skuBrandSelect');
  brandSelect.innerHTML = '<option value="">Loading brands...</option>';

  if (!catId) {
    brandSelect.innerHTML = '<option value="">-- Choose Category First --</option>';
    return;
  }

  const res = await fetch(`/api/catalog/categories/${catId}/brands`);
  const brands = await res.json();

  if (brands.length === 0) {
    brandSelect.innerHTML = '<option value="">No brands found in this category</option>';
    return;
  }

  brandSelect.innerHTML = brands.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
}

// ---------------------------------------------------------------------
// 2. MASTER CATALOG LOADING & SEARCH FILTERS
// ---------------------------------------------------------------------

async function loadAllProducts() {
  let products = [];
  for (const c of allCategories) {
    const bRes = await fetch(`/api/catalog/categories/${c.id}/brands`);
    const brands = await bRes.json();
    for (const b of brands) {
      const pRes = await fetch(`/api/catalog/brands/${b.id}/products`);
      const prods = await pRes.json();
      prods.forEach(p => {
        p.category_name = c.name;
        p.brand_name = b.name;
      });
      products.push(...prods);
    }
  }

  rawCatalog = products;
  filterMasterCatalog();
}

function filterMasterCatalog() {
  const query = document.getElementById('catalogSearchInput').value.toLowerCase().trim();
  const catFilter = document.getElementById('catalogCategoryFilter').value;
  const statusFilter = document.getElementById('catalogStatusFilter').value;

  const filtered = rawCatalog.filter(p => {
    // 1. Search text filter
    const matchesSearch = !query || 
      p.sku.toLowerCase().includes(query) || 
      p.name.toLowerCase().includes(query);

    // 2. Category filter
    const matchesCategory = !catFilter || p.category_name === catFilter;

    // 3. Status filter
    let matchesStatus = true;
    if (statusFilter === 'ACTIVE') matchesStatus = p.is_active === 1;
    if (statusFilter === 'INACTIVE') matchesStatus = p.is_active === 0;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  document.getElementById('catalogCountBadge').innerText = `Showing: ${filtered.length} of ${rawCatalog.length}`;
  renderCatalogTable(filtered);
}

function renderCatalogTable(products) {
  const tbody = document.getElementById('inventoryCatalogBody');
  if (products.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:30px; color:#64748b;">No matching SKUs found.</td></tr>';
    return;
  }

  tbody.innerHTML = products.map(p => `
    <tr style="${p.is_active === 0 ? 'background:#f8fafc; opacity:0.6;' : ''}">
      <td><code>${p.sku}</code></td>
      <td><strong>${p.name}</strong></td>
      <td><small>${p.category_name} &rarr; ${p.brand_name}</small></td>
      <td>1 Ctn = ${p.spools_per_carton} Sp</td>
      <td>📦 ${p.stock_cartons} Ctn + ${p.loose_spools} Sp</td>
      <td>$${p.cost_price_spool.toFixed(2)}</td>
      <td>$${p.retail_price_spool.toFixed(2)}</td>
      <td>$${p.wholesale_price_carton.toFixed(2)}</td>
      <td>
        <span style="font-weight:700; font-size:0.75rem; padding:2px 6px; border-radius:4px; 
              ${p.is_active === 1 ? 'background:#dcfce7; color:#166534;' : 'background:#fee2e2; color:#991b1b;'}">
          ${p.is_active === 1 ? 'Active' : 'Deactivated'}
        </span>
      </td>
      <td style="text-align:right;">
        <div style="display:flex; justify-content:flex-end; gap:6px;">
          <button class="btn-action" style="padding:4px 8px; font-size:0.8rem;" 
                  onclick='openEditProductModal(${JSON.stringify(p)})'>✏️ Edit</button>
          
          <button class="btn-action" style="padding:4px 8px; font-size:0.8rem; 
                  background:${p.is_active === 1 ? '#dc2626' : '#16a34a'};" 
                  onclick="toggleProductStatus(${p.id}, ${p.is_active})">
            ${p.is_active === 1 ? '🔴 Deactivate' : '🟢 Reactivate'}
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

// ---------------------------------------------------------------------
// 3. EDIT & TOGGLE STATUS
// ---------------------------------------------------------------------

function openEditProductModal(p) {
  document.getElementById('editProdId').value = p.id;
  document.getElementById('editProdSku').value = p.sku;
  document.getElementById('editProdRatio').value = p.spools_per_carton;
  document.getElementById('editProdName').value = p.name;
  document.getElementById('editProdCost').value = p.cost_price_spool;
  document.getElementById('editProdRetail').value = p.retail_price_spool;
  document.getElementById('editProdWholesale').value = p.wholesale_price_carton;
  document.getElementById('editProductModal').style.display = 'flex';
}

function closeEditProductModal() {
  document.getElementById('editProductModal').style.display = 'none';
}

async function handleSaveProductEdit(e) {
  e.preventDefault();
  const id = document.getElementById('editProdId').value;
  const payload = {
    sku: document.getElementById('editProdSku').value,
    spoolsPerCarton: parseInt(document.getElementById('editProdRatio').value),
    name: document.getElementById('editProdName').value,
    costPriceSpool: parseFloat(document.getElementById('editProdCost').value) || 0,
    retailPriceSpool: parseFloat(document.getElementById('editProdRetail').value) || 0,
    wholesalePriceCarton: parseFloat(document.getElementById('editProdWholesale').value) || 0
  };

  const res = await fetch(`/api/catalog/products/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (data.error) alert(data.error);
  else {
    alert('Product updated successfully!');
    closeEditProductModal();
    await loadAllProducts();
  }
}

async function toggleProductStatus(id, currentStatus) {
  const isDeactivating = currentStatus === 1;
  const confirmMsg = isDeactivating
    ? 'Deactivate this SKU? It will be hidden from POS sales counters.'
    : 'Reactivate this SKU? It will reappear on POS sales counters.';

  if (!confirm(confirmMsg)) return;

  const res = await fetch(`/api/catalog/products/${id}/toggle`, { method: 'PATCH' });
  if (res.ok) await loadAllProducts();
}

// ---------------------------------------------------------------------
// 4. CREATION HANDLERS
// ---------------------------------------------------------------------

async function handleCreateBrand(e) {
  e.preventDefault();
  const categoryId = document.getElementById('catSelect').value;
  const name = document.getElementById('brandName').value;

  const res = await fetch('/api/catalog/brands', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categoryId, name })
  });

  if (res.ok) {
    alert('Brand created!');
    document.getElementById('brandName').value = '';
    await loadCategories();
  }
}

async function handleCreateProduct(e) {
  e.preventDefault();
  const brandId = document.getElementById('skuBrandSelect').value;
  if (!brandId) {
    alert('Please select a valid Brand.');
    return;
  }

  const payload = {
    brandId,
    sku: document.getElementById('skuInput').value,
    name: document.getElementById('nameInput').value,
    spoolsPerCarton: parseInt(document.getElementById('ratioInput').value),
    initialStockSpools: parseInt(document.getElementById('stockInput').value) || 0,
    costPriceSpool: parseFloat(document.getElementById('costInput').value) || 0,
    retailPriceSpool: parseFloat(document.getElementById('retailInput').value) || 0,
    wholesalePriceCarton: parseFloat(document.getElementById('wholesaleInput').value) || 0
  };

  const res = await fetch('/api/catalog/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (data.error) alert(data.error);
  else {
    alert('New Product SKU registered!');
    document.getElementById('skuInput').value = '';
    document.getElementById('nameInput').value = '';
    await loadAllProducts();
  }
}