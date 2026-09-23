window.addEventListener('DOMContentLoaded', async () => {
  await loadDropdowns();
});

async function loadDropdowns() {
  const catRes = await fetch('/api/catalog/categories');
  const categories = await catRes.json();

  document.getElementById('catSelect').innerHTML = categories.map(c => 
    `<option value="${c.id}">${c.name}</option>`
  ).join('');

  const brandSelect = document.getElementById('brandSelect');
  brandSelect.innerHTML = '';
  for (const c of categories) {
    const bRes = await fetch(`/api/catalog/categories/${c.id}/brands`);
    const brands = await bRes.json();
    brands.forEach(b => {
      brandSelect.innerHTML += `<option value="${b.id}">[${c.name}] - ${b.name}</option>`;
    });
  }
}

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
    alert('Brand registered successfully!');
    document.getElementById('brandName').value = '';
    await loadDropdowns();
  }
}

async function handleCreateProduct(e) {
  e.preventDefault();
  const payload = {
    brandId: document.getElementById('brandSelect').value,
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

  if (res.ok) {
    alert('New Product SKU Created!');
    document.getElementById('skuInput').value = '';
    document.getElementById('nameInput').value = '';
  }
}