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
    <!-- Container for non-blocking toast notifications -->
    <div id="toast-container"></div>
  `;

  document.body.insertAdjacentHTML('afterbegin', navHtml);

  // -------------------------------------------------------------------
  // 1. GLOBAL NON-BLOCKING TOAST NOTIFICATION ENGINE
  // -------------------------------------------------------------------
  window.showToast = function(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-message ${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✓';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `
      <span>${icon} &nbsp;${message}</span>
      <button class="toast-close-btn">&times;</button>
    `;

    // Click to dismiss
    toast.querySelector('.toast-close-btn').onclick = () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      setTimeout(() => toast.remove(), 300);
    };

    container.appendChild(toast);

    // Auto-dismiss after 3.5 seconds
    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(40px)';
        setTimeout(() => toast.remove(), 300);
      }
    }, 3500);
  };

  // -------------------------------------------------------------------
  // 2. OVERRIDE NATIVE ALERT() TO PREVENT CHROMIUM KEYBOARD FREEZE
  // -------------------------------------------------------------------
  window.alert = function(msg) {
    const text = String(msg || '');
    // Automatically detect success vs error vs info
    if (text.toLowerCase().includes('success') || text.toLowerCase().includes('registered') || text.toLowerCase().includes('updated')) {
      window.showToast(text, 'success');
    } else if (text.toLowerCase().includes('failed') || text.toLowerCase().includes('error') || text.toLowerCase().includes('required')) {
      window.showToast(text, 'error');
    } else {
      window.showToast(text, 'info');
    }
  };

  // -------------------------------------------------------------------
  // 3. SAFE CONFIRM() WRAPPER (Forces Windows to restore keyboard focus)
  // -------------------------------------------------------------------
  const _nativeConfirm = window.confirm;
  window.confirm = function(msg) {
    const result = _nativeConfirm(msg);
    // Force Chromium on Windows to re-acquire the OS keyboard hook
    setTimeout(() => {
      window.blur();
      window.focus();
    }, 50);
    return result;
  };
})();