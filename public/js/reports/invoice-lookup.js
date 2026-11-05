let allInvoices = [];
let currentLoadedInvoice = null; // Track active invoice

window.addEventListener('DOMContentLoaded', async () => {
  await loadRecentInvoices();

  const urlParams = new URLSearchParams(window.location.search);
  const targetNumber = urlParams.get('number');
  if (targetNumber) {
    document.getElementById('inputSearchInvoice').value = targetNumber;
    await fetchAndRenderInvoice(targetNumber);
  }
});

// Load recent invoices (now displays cancelled tag if applicable)
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
    if (inv.status === 'CANCELLED') {
      typeBadge = '<span style="background:#fee2e2; color:#991b1b; font-size:0.7rem; font-weight:800; padding:2px 5px; border-radius:3px;">VOIDED</span>';
    } else if (inv.is_return === 1) {
      typeBadge = '<span style="background:#fef3c7; color:#92400e; font-size:0.7rem; font-weight:800; padding:2px 5px; border-radius:3px;">RETURN</span>';
    } else if (inv.type === 'OUT') {
      typeBadge = '<span style="background:#eff6ff; color:#1d4ed8; font-size:0.7rem; font-weight:800; padding:2px 5px; border-radius:3px;">SALE</span>';
    } else {
      typeBadge = '<span style="background:#f5f3ff; color:#6d28d9; font-size:0.7rem; font-weight:800; padding:2px 5px; border-radius:3px;">PURCHASE</span>';
    }

    const partyName = inv.party_shop ? `${inv.party_shop} (${inv.party_name})` : inv.party_name;

    return `
      <div onclick="fetchAndRenderInvoice('${inv.invoice_number}')" 
           style="padding: 12px; border-bottom: 1px solid #f1f5f9; cursor: pointer; ${inv.status === 'CANCELLED' ? 'opacity:0.6; background:#fff1f2;' : ''}">
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
  currentLoadedInvoice = invoice;

  document.getElementById('noSelectionMsg').style.display = 'none';
  document.getElementById('invoiceDocumentBody').style.display = 'block';

  // Void button state
  const voidBtn = document.getElementById('btnVoidInvoice');
  if (invoice.status === 'CANCELLED') {
    voidBtn.disabled = true;
    voidBtn.innerText = '🚫 Already Voided';
    voidBtn.style.background = '#94a3b8';
  } else {
    voidBtn.disabled = false;
    voidBtn.innerText = '🚫 Void / Cancel Invoice';
    voidBtn.style.background = '#dc2626';
  }

  // Badge Styling
  const badge = document.getElementById('docBadgeType');
  if (invoice.status === 'CANCELLED') {
    badge.innerText = 'CANCELLED / VOIDED';
    badge.style.background = '#fee2e2';
    badge.style.color = '#991b1b';
  } else if (invoice.is_return === 1) {
    if (invoice.type === 'OUT') {
      badge.innerText = 'SALES RETURN / CREDIT NOTE';
      badge.style.background = '#fef3c7';
      badge.style.color = '#92400e';
    } else {
      badge.innerText = 'DEBIT NOTE / SUPPLIER RETURN';
      badge.style.background = '#fef3c7';
      badge.style.color = '#92400e';
    }
  } else if (invoice.type === 'OUT') {
    badge.innerText = 'CUSTOMER SALES INVOICE';
    badge.style.background = '#eff6ff';
    badge.style.color = '#1d4ed8';
  } else {
    badge.innerText = 'INWARD PURCHASE VOUCHER';
    badge.style.background = '#f5f3ff';
    badge.style.color = '#6d28d9';
  }

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

// Handler for Void Button
async function handleVoidInvoice() {
  if (!currentLoadedInvoice) return;

  const reason = prompt(
    `Are you sure you want to VOID invoice ${currentLoadedInvoice.invoice_number}?\n\nThis will restore stock and reverse customer debt.\n\nEnter reason for cancellation:`,
    'Billed by mistake / Wrong customer'
  );

  if (reason === null) return; // User cancelled prompt

  const res = await fetch(`/api/invoices/${currentLoadedInvoice.id}/void`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: reason.trim() || 'Mistake' })
  });

  const data = await res.json();
  if (data.error) {
    alert(`Void Failed: ${data.error}`);
  } else {
    alert('Invoice successfully voided! Inventory restored and customer balance corrected.');
    await loadRecentInvoices();
    await fetchAndRenderInvoice(currentLoadedInvoice.id);
  }
}
// Safely trigger print only if an invoice is loaded
function printSelectedInvoice() {
  const docBody = document.getElementById('invoiceDocumentBody');
  if (!docBody || docBody.style.display === 'none') {
    alert('Please select or search for an invoice first before printing.');
    return;
  }

  window.print();
}