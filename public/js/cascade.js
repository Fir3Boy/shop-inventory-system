class CatalogDrillDown {
  constructor(tilesContainerId, breadcrumbContainerId, onSelectProductCallback) {
    this.tiles = document.getElementById(tilesContainerId);
    this.breadcrumbs = document.getElementById(breadcrumbContainerId);
    this.onSelectProduct = onSelectProductCallback;

    // Track active drill-down state
    this.currentCategory = null; // { id, name }
    this.currentBrand = null;    // { id, name }

    this.init();
  }

  async init() {
    await this.renderCategories();
  }

  // Render clickable breadcrumbs using real DOM elements
  setBreadcrumbs(crumbs) {
    this.breadcrumbs.innerHTML = ''; // Clear container

    crumbs.forEach((c, index) => {
      const isLast = index === crumbs.length - 1;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `crumb-btn ${isLast ? 'active' : ''}`;
      btn.textContent = c.label;

      // Attach actual event listener directly (never lost)
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        c.action();
      });

      this.breadcrumbs.appendChild(btn);
    });
  }

  // Level 1: Categories
  async renderCategories() {
    this.currentCategory = null;
    this.currentBrand = null;

    this.setBreadcrumbs([
      { label: 'Categories', action: () => this.renderCategories() }
    ]);

    const res = await fetch('/api/catalog/categories');
    const categories = await res.json();

    this.tiles.innerHTML = '';
    categories.forEach(c => {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.innerHTML = `<div>${c.name}</div>`;
      tile.addEventListener('click', () => this.renderBrands(c.id, c.name));
      this.tiles.appendChild(tile);
    });
  }

  // Level 2: Brands under Category
  async renderBrands(categoryId, categoryName) {
    this.currentCategory = { id: categoryId, name: categoryName };
    this.currentBrand = null;

    this.setBreadcrumbs([
      { label: 'Categories', action: () => this.renderCategories() },
      { label: categoryName, action: () => this.renderBrands(categoryId, categoryName) }
    ]);

    const res = await fetch(`/api/catalog/categories/${categoryId}/brands`);
    const brands = await res.json();

    this.tiles.innerHTML = '';
    if (!brands || brands.length === 0) {
      this.tiles.innerHTML = '<p style="padding:20px; color:#64748b;">No brands found under this category.</p>';
      return;
    }

    brands.forEach(b => {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.innerHTML = `<div>${b.name}</div>`;
      tile.addEventListener('click', () => this.renderProducts(b.id, b.name));
      this.tiles.appendChild(tile);
    });
  }

  // Level 3 & 4: Products under Brand
  async renderProducts(brandId, brandName) {
    this.currentBrand = { id: brandId, name: brandName };

    this.setBreadcrumbs([
      { label: 'Categories', action: () => this.renderCategories() },
      { label: this.currentCategory.name, action: () => this.renderBrands(this.currentCategory.id, this.currentCategory.name) },
      { label: brandName, action: () => this.renderProducts(brandId, brandName) }
    ]);

    const res = await fetch(`/api/catalog/brands/${brandId}/products`);
    const products = await res.json();

    this.tiles.innerHTML = '';
    if (!products || products.length === 0) {
      this.tiles.innerHTML = '<p style="padding:20px; color:#64748b;">No products found under this brand.</p>';
      return;
    }

    products.forEach(p => {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.innerHTML = `
        <div>${p.name}</div>
        <div class="stock-badge">📦 ${p.stock_cartons} Ctn + ${p.loose_spools} Spools</div>
      `;
      tile.addEventListener('click', () => this.onSelectProduct(p));
      this.tiles.appendChild(tile);
    });
  }
}