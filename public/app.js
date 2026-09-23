let currentDraft = null;
let selectedProduct = null;
let currentUnit = 'CARTON';
let currentQty = 1;
let cachedCategories = [];
let cachedBrands = [];

window.addEventListener('DOMContentLoaded', async () => {
  await loadParties();
  await loadCategories();
  await loadAdminDropdowns();
});

// View Toggle
function switchView(view) {
  document.getElementById('viewPos').style.display = view === 'pos' ? 'flex' : 'none';
  document.getElementById('viewAdmin').style.display = view === 'admin' ? 'grid' : 'none';
  document.getElementById('tabPos').className = `nav-btn ${view === 'pos' ? 'active' : ''}`;
  document.getElementById('tabAdmin').className = `nav-btn ${view === 'admin' ? 'active' : ''}`;

  if (view === 'admin') loadAdminDropdowns();
  if (view === 'pos') loadCategories();
}

// ---------------------------------------------------------------------
// POS & CATALOG DRILL-DOWN
// ---------------------------------------------------------------------

async function loadCategories() {
  updateBreadcrumbs([{ label: 'Categories', action: 'loadCategories()' }]);
  const res = await fetch('/api/categories');
  cachedCategories = await res.json();
  
  const grid = document.getElementById('tilesGrid');
  grid.innerHTML = cachedCategories.map(c => `
    <div class="tile" onclick="loadBrands(${c.id}, '${c.name}')">
      <div>${c.name}</div>
    </div>
  `).join('');
}

async function loadBrands(categoryId, categoryName) {
  updateBreadcrumbs([
    { label: 'Categories', action: 'loadCategories()' },
    { label: categoryName, action: `loadBrands(${categoryId}, '${categoryName}')` }
  ]);

  const res = await fetch(`/api/categories/${categoryId}/brands`);
  const brands = await res.json();

  const grid = document.getElementById('tilesGrid');
  grid.innerHTML = brands.length ? brands.map(b => `
    <div class="tile" onclick="loadProducts(${b.id}, '${categoryName}', '${b.name}')">
      <div>${b.name}</div>
    </div>
  `).join('') : '<p style="padding:20px;">No brands created yet under this category.</p>';
}

async function loadProducts(brandId, categoryName, brandName) {
  updateBreadcrumbs([
    { label: 'Categories', action: 'loadCategories()' },
    { label: categoryName, action: `loadBrands(null, '${categoryName}')` },
    { label: brandName, action: `loadProducts(${brandId}, '${categoryName}', '${brandName}')` }
  ]);

  const res = await fetch(`/api/brands/${brandId}/products`);
  const products = await res.json();

  const grid = document.getElementById('tilesGrid');
  grid.innerHTML = products.length ? products.map(p => `
    <div class="tile" onclick='openModal(${JSON.stringify(p)})'>
      <div>${p.name}</div>
      <div class="stock-tag">📦 ${p.stock_cartons} Cartons + ${p.loose_spools} Spools</div>
    </div>
  `).join('') : '<p style="padding:20px;">No products created yet under this brand.</p>';
}

function updateBreadcrumbs(crumbs) {
  const bar = document.getElementById('breadcrumbBar');
  bar.innerHTML = crumbs.map((c, i) => `
    <button class="crumb-btn ${i === crumbs.length - 1 ? 'active' : ''}" onclick="${c.action}">
      ${c.label}
    </button>
  `).join('');
}

// ---------------------------------------------------------------------
// MODAL & LIVE PRICE OVERRIDE
// ---------------------------------------------------------------------

function openModal(product) {
  selectedProduct = product;
  currentUnit = 'CARTON';
  currentQty = 1;
  
  document.getElementById('modalProductName').innerText = product.name;
  document.getElementById('modalStockInfo').innerText = 
    `Ratio: 1 Carton = ${product.spools_per_carton} Spools | Total Spools: ${product.stock_spools}`;
  document.getElementById('qtyDisplay').innerText = currentQty;
  
  setUnit('CARTON');
  document.getElementById('unitModal').style.display = 'flex';
}

function setUnit(unit) {
  currentUnit = unit;
  document.getElementById('btnUnitCarton').className = `unit-btn ${unit === 'CARTON' ? 'active' : ''}`;
  document.getElementById('btnUnitSpool').className = `unit-btn ${unit === 'SPOOL' ? 'active' : ''}`;

  // Prepopulate today's default price for that unit
  const defaultPrice = unit === 'CARTON' 
    ? selectedProduct.wholesale_price_carton 
    : selectedProduct.retail_price_spool;
  
  document.getElementById('modalPriceInput').value = defaultPrice;
}

function closeModal() {
  document.getElementById('unitModal').style.display = 'none';
}

function adjustQty(amount) {
  currentQty = Math.max(1, currentQty + amount);
  document.getElementById('qtyDisplay').innerText = currentQty;
}

async function addItemToDraft() {
  if (!currentDraft || !selectedProduct) return;

  const customPrice = parseFloat(document.getElementById('modalPriceInput').value) || 0;

  const res = await fetch(`/api/invoices/${currentDraft.id}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productId: selectedProduct.id,
      unit: currentUnit,
      quantity: currentQty,
      customUnitPrice: customPrice
    })
  });

  const data = await res.json();
  if (data.error) {
    alert(data.error);
    return;
  }

  renderInvoiceItems(data.items);
  closeModal();
}

function renderInvoiceItems(items) {
  const tbody = document.getElementById('invoiceItemsBody');
  if (!items || items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-msg">No items added yet.</td></tr>`;
    document.getElementById('txtTotal').innerText = '$0.00';
    return;
  }

  let total = 0;
  tbody.innerHTML = items.map(item => {
    total += item.line_total;
    return `
      <tr>
        <td><strong>${item.product_name}</strong><br><small>${item.sku}</small></td>
        <td>${item.unit}</td>
        <td>${item.quantity}</td>
        <td>$${item.unit_price.toFixed(2)}</td>
        <td>$${item.line_total.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  document.getElementById('txtTotal').innerText = `$${total.toFixed(2)}`;
}

// ---------------------------------------------------------------------
// PARTIES & COMMITTING
// ---------------------------------------------------------------------

async function loadParties() {
  const res = await fetch('/api/parties');
  const parties = await res.json();
  const select = document.getElementById('partySelect');
  select.innerHTML = parties.map(p => 
    `<option value="${p.id}">${p.name} (Bal: $${p.current_balance})</option>`
  ).join('');

  await startDraftInvoice();
}

async function startDraftInvoice() {
  const partyId = document.getElementById('partySelect').value;
  if (!partyId) return;

  const res = await fetch('/api/invoices/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ partyId, type: 'OUT' })
  });
  currentDraft = await res.json();
  renderInvoiceItems([]);
}

async function commitInvoice() {
  if (!currentDraft) return;
  if (!confirm('Commit this invoice? Stock and customer debt will update.')) return;

  const res = await fetch(`/api/invoices/${currentDraft.id}/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paidAmount: 0 })
  });

  const result = await res.json();
  if (result.error) alert(`Error: ${result.error}`);
  else {
    alert('Invoice finalized!');
    await loadParties();
    await loadCategories();
  }
}

// ---------------------------------------------------------------------
// ADMIN MANAGEMENT HANDLERS (FATHER'S FORM SUBMISSIONS)
// ---------------------------------------------------------------------

async function loadAdminDropdowns() {
  const resCat = await fetch('/api/categories');
  const categories = await resCat.json();
  document.getElementById('adminCategorySelect').innerHTML = categories.map(c => 
    `<option value="${c.id}">${c.name}</option>`
  ).join('');

  // Load all brands
  const brandSelect = document.getElementById('adminBrandSelect');
  brandSelect.innerHTML = '';
  for (const cat of categories) {
    const resB = await fetch(`/api/categories/${cat.id}/brands`);
    const brands = await resB.json();
    brands.forEach(b => {
      brandSelect.innerHTML += `<option value="${b.id}">[${cat.name}] - ${b.name}</option>`;
    });
  }
}

async function handleCreateBrand(e) {
  e.preventDefault();
  const categoryId = document.getElementById('adminCategorySelect').value;
  const name = document.getElementById('brandNameInput').value;

  const res = await fetch('/api/brands', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categoryId, name })
  });

  if (res.ok) {
    alert('Brand created successfully!');
    document.getElementById('brandNameInput').value = '';
    await loadAdminDropdowns();
  }
}

async function handleCreateProduct(e) {
  e.preventDefault();
  const payload = {
    brandId: document.getElementById('adminBrandSelect').value,
    name: document.getElementById('prodNameInput').value,
    sku: document.getElementById('prodSkuInput').value,
    spoolsPerCarton: parseInt(document.getElementById('prodRatioInput').value),
    initialStockSpools: parseInt(document.getElementById('prodStockInput').value),
    wholesalePriceCarton: parseFloat(document.getElementById('prodWholesaleInput').value),
    retailPriceSpool: parseFloat(document.getElementById('prodRetailInput').value)
  };

  const res = await fetch('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    alert('Product SKU successfully created!');
    document.getElementById('prodNameInput').value = '';
    document.getElementById('prodSkuInput').value = '';
  }
}

async function handleCreateParty(e) {
  e.preventDefault();
  const payload = {
    type: document.getElementById('partyTypeSelect').value,
    name: document.getElementById('partyNameInput').value,
    phone: document.getElementById('partyPhoneInput').value,
    initialBalance: parseFloat(document.getElementById('partyBalanceInput').value) || 0
  };

  const res = await fetch('/api/parties', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    alert('Party created successfully!');
    document.getElementById('partyNameInput').value = '';
    document.getElementById('partyPhoneInput').value = '';
    await loadParties();
  }
}