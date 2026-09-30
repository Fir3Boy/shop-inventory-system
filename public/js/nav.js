(function initNav() {
  const pages = [
    { title: '📊 Dashboard', url: '/index.html' },
    { title: '🛒 POS Sales', url: '/sales.html' },
    { title: '📦 Purchases', url: '/purchases.html' },
    { title: '👥 Customers', url: '/customers.html' },
    { title: '💳 Customer Debts', url: '/customer-debts.html' },
    { title: '🏭 Suppliers', url: '/suppliers.html' },
    { title: '📑 Supplier Payables', url: '/supplier-debts.html' },
    { title: '⚙️ SKUs & Stock', url: '/inventory.html' },
    { title: '📈 Reports', url: '/reports.html', isMatch: (path) => path.includes('report') }
  ];

  const currentPath = window.location.pathname;

  const navHtml = `
    <header class="app-header">
      <div class="brand-title">🧵 TEXTILE ERP</div>
      <nav class="nav-links">
        ${pages.map(p => {
          const isActive = p.isMatch 
            ? p.isMatch(currentPath) 
            : (currentPath === p.url || (currentPath === '/' && p.url === '/index.html'));
          return `<a href="${p.url}" class="nav-tab ${isActive ? 'active' : ''}">${p.title}</a>`;
        }).join('')}
      </nav>
    </header>
  `;

  document.body.insertAdjacentHTML('afterbegin', navHtml);
})();