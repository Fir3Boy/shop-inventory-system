class InvoiceDraftEngine {
  constructor(invoiceType, partySelectId, tableBodyId, totalDisplayId) {
    this.type = invoiceType; // 'OUT' or 'IN'
    this.partySelect = document.getElementById(partySelectId);
    this.tableBody = document.getElementById(tableBodyId);
    this.totalDisplay = document.getElementById(totalDisplayId);
    this.currentDraft = null;
    this.selectedProduct = null;
    this.currentUnit = 'CARTON';
    this.currentQty = 1;
    this.init();
  }

  async init() {
    await this.loadParties();
    this.setupModalControls();
  }

  async loadParties() {
    const filter = this.type === 'OUT' ? 'CUSTOMER' : 'SUPPLIER';
    const res = await fetch(`/api/parties?type=${filter}`);
    const parties = await res.json();

    this.partySelect.innerHTML = parties.map(p => 
      `<option value="${p.id}">${p.name} (Bal: $${p.current_balance})</option>`
    ).join('');

    await this.createNewDraft();
  }

  async createNewDraft() {
    const partyId = this.partySelect.value;
    if (!partyId) return;

    const res = await fetch('/api/invoices/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partyId, type: this.type })
    });
    this.currentDraft = await res.json();
    this.renderTable([]);
  }

  openAddModal(product) {
    this.selectedProduct = product;
    this.currentUnit = 'CARTON';
    this.currentQty = 1;

    document.getElementById('modalProductName').innerText = product.name;
    document.getElementById('modalStockInfo').innerText = 
      `Ratio: 1 Ctn = ${product.spools_per_carton} Spools | Current Stock: ${product.stock_spools} Spools`;
    document.getElementById('qtyDisplay').innerText = this.currentQty;
    
    this.setUnit('CARTON');
    document.getElementById('unitModal').style.display = 'flex';
  }

  setUnit(unit) {
    this.currentUnit = unit;
    document.getElementById('btnUnitCarton').className = `unit-btn ${unit === 'CARTON' ? 'active' : ''}`;
    document.getElementById('btnUnitSpool').className = `unit-btn ${unit === 'SPOOL' ? 'active' : ''}`;

    // Default wholesale/retail suggestion based on invoice type
    let defaultPrice = 0;
    if (this.type === 'OUT') {
      defaultPrice = unit === 'CARTON' ? this.selectedProduct.wholesale_price_carton : this.selectedProduct.retail_price_spool;
    } else {
      // Inbound purchase uses cost price
      defaultPrice = unit === 'CARTON' 
        ? (this.selectedProduct.cost_price_spool * this.selectedProduct.spools_per_carton) 
        : this.selectedProduct.cost_price_spool;
    }

    document.getElementById('modalPriceInput').value = defaultPrice.toFixed(2);
  }

  adjustQty(val) {
    this.currentQty = Math.max(1, this.currentQty + val);
    document.getElementById('qtyDisplay').innerText = this.currentQty;
  }

  setupModalControls() {
    window.setModalUnit = (u) => this.setUnit(u);
    window.adjustModalQty = (v) => this.adjustQty(v);
    window.closeModal = () => { document.getElementById('unitModal').style.display = 'none'; };
    window.confirmAddItem = () => this.submitItem();
  }

  async submitItem() {
    const customPrice = parseFloat(document.getElementById('modalPriceInput').value) || 0;

    const res = await fetch(`/api/invoices/${this.currentDraft.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: this.selectedProduct.id,
        unit: this.currentUnit,
        quantity: this.currentQty,
        customUnitPrice: customPrice
      })
    });

    const data = await res.json();
    if (data.error) {
      alert(data.error);
      return;
    }

    this.renderTable(data.items);
    window.closeModal();
  }

  async removeItem(itemId) {
    const res = await fetch(`/api/invoices/${this.currentDraft.id}/items/${itemId}`, { method: 'DELETE' });
    const data = await res.json();
    this.renderTable(data.items);
  }

  renderTable(items) {
    if (!items || items.length === 0) {
      this.tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 30px; color: #94a3b8;">No items in sheet.</td></tr>`;
      this.totalDisplay.innerText = '$0.00';
      return;
    }

    let total = 0;
    this.tableBody.innerHTML = items.map(item => {
      total += item.line_total;
      return `
        <tr>
          <td><strong>${item.product_name}</strong></td>
          <td>${item.unit}</td>
          <td>${item.quantity}</td>
          <td>$${item.unit_price.toFixed(2)}</td>
          <td>$${item.line_total.toFixed(2)}</td>
          <td><button class="btn-delete-row" onclick="draftEngine.removeItem(${item.id})">&times;</button></td>
        </tr>
      `;
    }).join('');

    this.totalDisplay.innerText = `$${total.toFixed(2)}`;
  }

  async commit(btn) {
    if (!this.currentDraft) return;
    if (!confirm(`Finalize and commit this ${this.type === 'OUT' ? 'SALE' : 'PURCHASE'}?`)) return;

    btn.disabled = true;
    const res = await fetch(`/api/invoices/${this.currentDraft.id}/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paidAmount: 0 })
    });

    const data = await res.json();
    btn.disabled = false;

    if (data.error) alert(`Failed: ${data.error}`);
    else {
      alert('Invoice finalized! Balances and stocks updated.');
      window.location.reload();
    }
  }
}