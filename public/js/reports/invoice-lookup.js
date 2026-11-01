let allInvoices = [];

window.addEventListener('DOMContentLoaded', async () => {
  await loadRecentInvoices();

  // If URL has ?number=SALE-XXXXX, auto-load that invoice directly!
  const urlParams = new URLSearchParams(window.location.search);
  const targetNumber = urlParams.get('number');
  if (targetNumber) {
    document.getElementById('inputSearchInvoice').value = targetNumber;
    await fetchAndRenderInvoice(targetNumber);
  }
});

// Load recent 50 completed invoices
async function loadRecentInvoices(searchTerm = '') {
  const res = await fetch(`/api/invoices/lookup?q=${encodeURIComponent(searchTerm)}`);
  allInvoices = await res.json();
  renderSidebarList(allInvoices);
}

function onSearchInput() {
  const q = document.getElementById('inputSearchInvoice').value.trim();
  loadRecentInvoices(q);
}

function renderSidebarList(invoices) {
  const container = document.getElementById('searchResultsList');
  if (invoices.length === 0) {
    container.innerHTML = '<p style="padding:20px; text-align:center; color:#94a3b8;">No matching invoices found.</p>';
    return;
  }

  container.innerHTML = invoices.map(inv => {
    let typeBadge = '';
    if (inv.is_return === 1) {
      typeBadge = '<span style="background:#fef3c7; color:#92400e; font-size:0.7rem; font-weight:800; padding:2px 5px; border-radius:3px;">RETURN</span>';
    } else if (inv.type === 'OUT') {
      typeBadge = '<span style="background:#eff6ff; color:#1d4ed8; font-size:0.7rem; font-weight:800; padding:2px 5px; border-radius:3px;">SALE</span>';
    } else {
      typeBadge = '<span style="background:#f5f3ff; color:#6d28d9; font-size:0.7rem; font-weight:800; padding:2px 5px; border-radius:3px;">PURCHASE</span>';
    }

    const partyName = inv.party_shop ? `${inv.party_shop} (${inv.party_name})` : inv.party_name;

    return `
      <div onclick="fetchAndRenderInvoice('${inv.invoice_number}')" 
           style="padding: 12px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: background 0.15s ease;"
           onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <strong style="color:#0f172a; font-size:0.95rem;">${inv.invoice_number}</strong>
          ${typeBadge}
        </div>
        <div style="font-size:0.85rem; color:#475569; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
          ${partyName}
        </div>
        ${inv.notes ? `<div style="font-size:0.75rem; color:#64748b;">Ref: ${inv.notes}</div>` : ''}
        <div style="display:flex; justify-content:space-between; margin-top:4px; font-size:0.8rem;">
          <span style="color:#94a3b8;">${inv.invoice_date}</span>
          <strong style="color:#0f172a;">$${inv.total_amount.toFixed(2)}</strong>
        </div>
      </div>
    `;
  }).join('');
}

// Fetch and display full details
async function fetchAndRenderInvoice(identifier) {
  const res = await fetch(`/api/invoices/details/${identifier}`);
  const data = await res.json();

  if (data.error) {
    alert(data.error);
    return;
  }

  const { invoice, items } = data;

  // Show document and hide empty message
  document.getElementById('noSelectionMsg').style.display = 'none';
  document.getElementById('invoiceDocumentBody').style.display = 'block';

  // Badge & Type Styling
  const badge = document.getElementById('docBadgeType');
  if (invoice.is_return === 1) {
    badge.innerText = 'SALES RETURN / CREDIT NOTE';
    badge.style.background = '#fef3c7';
    badge.style.color = '#92400e';
  } else if (invoice.type === 'OUT') {
    badge.innerText = 'CUSTOMER SALES INVOICE';
    badge.style.background = '#eff6ff';
    badge.style.color = '#1d4ed8';
  } else {
    badge.innerText = 'INWARD PURCHASE VOUCHER';
    badge.style.background = '#f5f3ff';
    badge.style.color = '#6d28d9';
  }

  // Header Details
  document.getElementById('docInvoiceNumber').innerText = invoice.invoice_number;
  document.getElementById('docDate').innerText = invoice.invoice_date;

  // Party Block
  document.getElementById('lblPartyType').innerText = invoice.type === 'OUT' ? 'Billed To (Customer):' : 'Received From (Supplier):';
  document.getElementById('docPartyName').innerText = invoice.party_shop 
    ? `${invoice.party_shop} (${invoice.party_name})` 
    : invoice.party_name;

  document.getElementById('docPartyContact').innerText = `Phone: ${invoice.party_phone || '-'} ${invoice.party_secondary_phone ? `| WA: ${invoice.party_secondary_phone}` : ''}`;
  document.getElementById('docPartyAddress').innerText = `${invoice.party_city || ''} ${invoice.party_address || ''}`.trim() || 'Address not listed';

  // Notes
  document.getElementById('docInvoiceNotes').innerText = invoice.notes || 'None';

  // Line items
  const tbody = document.getElementById('docItemsBody');
  tbody.innerHTML = items.map((it, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td><strong>${it.product_name}</strong><br><small style="color:#64748b;">${it.brand_name}</small></td>
      <td><code>${it.sku}</code></td>
      <td>${it.unit}</td>
      <td><strong>${it.quantity}</strong></td>
      <td>${it.base_quantity_spools} Sp</td>
      <td>$${it.unit_price.toFixed(2)}</td>
      <td><strong>$${it.line_total.toFixed(2)}</strong></td>
    </tr>
  `).join('');

  // Financial totals
  document.getElementById('docTotalAmount').innerText = `$${invoice.total_amount.toFixed(2)}`;
  document.getElementById('docPaidAmount').innerText = `$${invoice.paid_amount.toFixed(2)}`;
  document.getElementById('docBalanceDue').innerText = `$${invoice.balance_due.toFixed(2)}`;
}