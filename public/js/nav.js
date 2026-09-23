(function initNav() {
  const pages = [
    { title: '📊 Dashboard', url: 'index.html' },
    { title: '🛒 POS Sales', url: 'sales.html' },
    { title: '📦 Purchases (Stock IN)', url: 'purchases.html' },
    { title: '⚙️ Inventory & SKUs', url: 'inventory.html' },
    { title: '💳 Debts & Ledger', url: 'debts.html' }
  ];

  const currentPath = window.location.pathname.split('/').pop() || 'index.html';

  const navHtml = `
    <header class="app-header">
      <div class="brand-title">🧵 TEXTILE ERP</div>
      <nav class="nav-links">
        ${pages.map(p => `
          <a href="${p.url}" class="nav-tab ${p.url === currentPath ? 'active' : ''}">${p.title}</a>
        `).join('')}
      </nav>
    </header>
  `;

  document.body.insertAdjacentHTML('afterbegin', navHtml);
})();