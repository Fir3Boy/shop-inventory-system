class InvoiceDraftEngine {
  constructor(invoiceType, partySelectId, tableBodyId) {
    this.type = invoiceType; // 'OUT' or 'IN'
    this.partySelect = document.getElementById(partySelectId);
    this.tableBody = document.getElementById(tableBodyId);

    this.txtOldBalance = document.getElementById('txtOldBalance');
    this.txtBillTotal = document.getElementById('txtBillTotal');
    this.inputCashPaid = document.getElementById('inputCashPaid');
    this.txtNewBalance = document.getElementById('txtNewBalance');

    this.currentDraft = null;
    this.currentParty = null;
    this.partiesList = [];
    this.currentBillTotal = 0;

    this.selectedProduct = null;
    this.currentUnit = 'CARTON';
    this.currentQty = 1;

    this.init();
  }

  async init() {
    await this.loadParties();
    this.setupModalControls();
  }
  // Toggle between Standard Sale and Return Mode
  async setMode(isReturn) {
    if (this.isReturn === isReturn) return;
    this.isReturn = isReturn;

    const btnSale = document.getElementById('btnModeSale');
    const btnReturn = document.getElementById('btnModeReturn');
    const title = document.getElementById('txtInvoiceTitle');
    const billLabel = document.getElementById('txtBillTotalLabel');
    const cashLabel = document.getElementById('lblCashPaid');
    const commitBtn = document.getElementById('btnCommitInvoice');
    const panel = document.getElementById('invoicePanel');

    if (this.isReturn) {
      btnReturn.style.background = '#d97706';
      btnReturn.style.color = '#fff';
      btnSale.style.background = '#cbd5e1';
      btnSale.style.color = '#475569';

      panel.style.borderTop = '5px solid #d97706';
      title.innerText = '🔄 Customer Return (Credit Note)';
      title.style.color = '#d97706';
      billLabel.innerText = 'Return Credit Value:';
      cashLabel.innerText = 'Cash Refund Given Out ($):';
      commitBtn.innerText = '✓ COMMIT RETURN & RESTOCK';
      commitBtn.style.background = '#d97706';
    } else {
      btnSale.style.background = '#2563eb';
      btnSale.style.color = '#fff';
      btnReturn.style.background = '#cbd5e1';
      btnReturn.style.color = '#475569';

      panel.style.borderTop = 'none';
      title.innerText = 'Customer Sales Invoice';
      title.style.color = '#0f172a';
      billLabel.innerText = 'Bill Total:';
      cashLabel.innerText = 'Cash Received ($):';
      commitBtn.innerText = '✓ COMMIT SALE';
      commitBtn.style.background = '#16a34a';
    }

    // Start a new draft sheet with the chosen mode
    await this.createNewDraft();
  }

  async createNewDraft() {
    if (!this.currentParty) return;

    const res = await fetch('/api/invoices/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        partyId: this.currentParty.id, 
        type: this.type,
        isReturn: this.isReturn 
      })
    });
    this.currentDraft = await res.json();
    
    const notesInput = document.getElementById('inputInvoiceNotes');
    if (notesInput) notesInput.value = '';

    this.renderTable([]);
  }

  calculateBalances() {
    if (this.txtBillTotal) {
      this.txtBillTotal.innerText = `$${this.currentBillTotal.toFixed(2)}`;
    }

    const cashInput = this.inputCashPaid ? (parseFloat(this.inputCashPaid.value) || 0) : 0;
    const oldBalance = this.currentParty ? this.currentParty.current_balance : 0;

    let newBalance = oldBalance;

    if (this.type === 'OUT') {
      if (this.isReturn) {
        // RETURN: Returning goods reduces customer debt (- billTotal)
        // If cash refund is given to customer, it adds back (+ cashInput)
        newBalance = oldBalance - this.currentBillTotal + cashInput;
      } else {
        // SALE: Goods increase debt (+ billTotal) - cash received (- cashInput)
        newBalance = oldBalance + this.currentBillTotal - cashInput;
      }
    } else {
      // PURCHASE
      newBalance = oldBalance - this.currentBillTotal + cashInput;
    }

    if (this.txtNewBalance) {
      this.txtNewBalance.innerText = `$${newBalance.toFixed(2)}`;
      this.txtNewBalance.style.color = newBalance > 0 ? '#16a34a' : '#dc2626';
    }
  }

  setFullCash() {
    if (this.inputCashPaid) {
      this.inputCashPaid.value = this.currentBillTotal.toFixed(2);
      this.calculateBalances();
    }
  }

  async commit(btn) {
    if (!this.currentDraft) return;

    const actionText = this.isReturn ? 'RETURN and restock' : 'SALE';
    if (!confirm(`Finalize and commit this ${actionText}?`)) return;

    const cashAmount = this.inputCashPaid ? (parseFloat(this.inputCashPaid.value) || 0) : 0;
    const notesInput = document.getElementById('inputInvoiceNotes');
    const notes = notesInput ? notesInput.value.trim() : '';

    btn.disabled = true;
    const res = await fetch(`/api/invoices/${this.currentDraft.id}/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paidAmount: cashAmount, notes })
    });

    const data = await res.json();
    btn.disabled = false;

    if (data.error) {
      alert(`Commit Failed: ${data.error}`);
    } else {
      alert(this.isReturn ? 'Return processed! Items added back to stock.' : 'Sale committed successfully!');
      window.location.reload();
    }
  }


async loadParties() {
    const filter = this.type === 'OUT' ? 'CUSTOMER' : 'SUPPLIER';
    const res = await fetch(`/api/parties?type=${filter}`);
    this.partiesList = await res.json();

    this.partySelect.innerHTML = this.partiesList.map(p => {
      let displayName = '';

      if (this.type === 'OUT') {
        // Customer: "🏪 Shop Name (Contact Person)"
        displayName = p.shop_name 
          ? `🏪 ${p.shop_name} (${p.name})` 
          : `👤 ${p.name}`;

        return `<option value="${p.id}">${displayName} &nbsp;—&nbsp; Debt: $${p.current_balance.toFixed(2)}</option>`;
      } else {
        // Supplier: "🏭 Mill / Company (Rep Name)"
        displayName = p.shop_name 
          ? `🏭 ${p.shop_name} (Rep: ${p.name})` 
          : `👤 ${p.name}`;

        const owed = p.current_balance < 0 ? Math.abs(p.current_balance) : 0;
        return `<option value="${p.id}">${displayName} &nbsp;—&nbsp; Owed: $${owed.toFixed(2)}</option>`;
      }
    }).join('');

    await this.handlePartyChange();
  }

  async handlePartyChange() {
    const partyId = parseInt(this.partySelect.value);
    this.currentParty = this.partiesList.find(p => p.id === partyId) || null;

    if (this.txtOldBalance && this.currentParty) {
      if (this.type === 'OUT') {
        this.txtOldBalance.innerText = `$${this.currentParty.current_balance.toFixed(2)}`;
      } else {
        // Supplier: Show absolute amount owed clearly without confusing negative signs
        const owed = this.currentParty.current_balance < 0 ? Math.abs(this.currentParty.current_balance) : 0;
        this.txtOldBalance.innerText = `$${owed.toFixed(2)}`;
      }
    }

    await this.createNewDraft();
  }

  async createNewDraft() {
    if (!this.currentParty) return;

    const res = await fetch('/api/invoices/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partyId: this.currentParty.id, type: this.type })
    });
    this.currentDraft = await res.json();
    
    // Clear notes field for the new sheet
    const notesInput = document.getElementById('inputInvoiceNotes');
    if (notesInput) notesInput.value = '';

    this.renderTable([]);
  }

  openAddModal(product) {
    this.selectedProduct = product;
    this.currentUnit = 'CARTON';
    this.currentQty = 1;

    document.getElementById('modalProductName').innerText = product.name;
    document.getElementById('modalStockInfo').innerText = 
      `Ratio: 1 Ctn = ${product.spools_per_carton} Spools | Stock: ${product.stock_spools} Spools`;
    document.getElementById('qtyDisplay').innerText = this.currentQty;
    
    this.setUnit('CARTON');
    document.getElementById('unitModal').style.display = 'flex';
  }

// Update unit selection & calculate base cost hint
  setUnit(unit) {
    this.currentUnit = unit;
    document.getElementById('btnUnitCarton').className = `unit-btn ${unit === 'CARTON' ? 'active' : ''}`;
    document.getElementById('btnUnitSpool').className = `unit-btn ${unit === 'SPOOL' ? 'active' : ''}`;

    const lastCostSpool = this.selectedProduct.last_cost_spool || 0;
    const ratio = this.selectedProduct.spools_per_carton;
    
    // Calculate cost in the currently selected unit
    const unitCost = unit === 'CARTON' ? (lastCostSpool * ratio) : lastCostSpool;

    // Display the cost floor hint
    const hintEl = document.getElementById('txtLastCostHint');
    if (hintEl) {
      hintEl.innerText = `Last Inward Cost: $${unitCost.toFixed(2)} / ${unit === 'CARTON' ? 'Ctn' : 'Spool'}`;
    }

    // Default price suggestion
    let defaultPrice = 0;
    if (this.type === 'OUT') {
      defaultPrice = unit === 'CARTON' ? this.selectedProduct.wholesale_price_carton : this.selectedProduct.retail_price_spool;
    } else {
      defaultPrice = unitCost;
    }

    const priceInput = document.getElementById('modalPriceInput');
    priceInput.value = defaultPrice.toFixed(2);
    
    this.updateMarginDisplay();
  }

// Live Profit (Sales) OR Price-Change Tracker (Purchases)
  updateMarginDisplay() {
    const feedbackEl = document.getElementById('txtMarginFeedback');
    if (!feedbackEl || !this.selectedProduct) return;

    const currentPrice = parseFloat(document.getElementById('modalPriceInput').value) || 0;
    const lastCostSpool = this.selectedProduct.last_cost_spool || 0;
    const ratio = this.selectedProduct.spools_per_carton;
    const prevCost = this.currentUnit === 'CARTON' ? (lastCostSpool * ratio) : lastCostSpool;

    const diff = currentPrice - prevCost;
    const percentChange = prevCost > 0 ? ((diff / prevCost) * 100).toFixed(1) : 0;

    // --- CASE 1: SALES COUNTER (Profit Margin) ---
    if (this.type === 'OUT') {
      if (diff < 0) {
        feedbackEl.style.color = '#dc2626'; // Red
        feedbackEl.innerText = `⚠️ Selling BELOW cost! (-$${Math.abs(diff).toFixed(2)} loss/unit)`;
      } else if (diff === 0) {
        feedbackEl.style.color = '#64748b';
        feedbackEl.innerText = `Break-even ($0.00 profit)`;
      } else {
        feedbackEl.style.color = '#16a34a'; // Green
        feedbackEl.innerText = `✅ Profit: +$${diff.toFixed(2)} per unit (+${percentChange}%)`;
      }
    } 
    // --- CASE 2: PURCHASES / STOCK IN (Supplier Price Difference) ---
    else {
      if (diff > 0) {
        feedbackEl.style.color = '#ea580c'; // Orange warning
        feedbackEl.innerText = `📈 Price INCREASE: +$${diff.toFixed(2)} (+${percentChange}%) higher than last batch`;
      } else if (diff < 0) {
        feedbackEl.style.color = '#16a34a'; // Green discount
        feedbackEl.innerText = `📉 Price DECREASE: -$${Math.abs(diff).toFixed(2)} (-${Math.abs(percentChange)}%) cheaper than last batch`;
      } else {
        feedbackEl.style.color = '#64748b';
        feedbackEl.innerText = `Same as previous purchase rate`;
      }
    }
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
      this.currentBillTotal = 0;
      this.calculateBalances();
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

    this.currentBillTotal = total;
    this.calculateBalances();
  }

  // Set Cash Received = Bill Total with 1 click
  setFullCash() {
    if (this.inputCashPaid) {
      this.inputCashPaid.value = this.currentBillTotal.toFixed(2);
      this.calculateBalances();
    }
  }

  // Real-time recalculation of remaining party balance
  calculateBalances() {
    if (this.txtBillTotal) {
      this.txtBillTotal.innerText = `$${this.currentBillTotal.toFixed(2)}`;
    }

    const cashPaid = this.inputCashPaid ? (parseFloat(this.inputCashPaid.value) || 0) : 0;
    const oldBalance = this.currentParty ? this.currentParty.current_balance : 0;

    let newBalance = oldBalance;
    if (this.type === 'OUT') {
      // Sale: Old Debt + Today's Bill - Cash Received
      newBalance = oldBalance + this.currentBillTotal - cashPaid;
    } else {
      // Purchase: We owe more (+ bill), minus cash we pay
      newBalance = oldBalance - this.currentBillTotal + cashPaid;
    }

    if (this.txtNewBalance) {
      this.txtNewBalance.innerText = `$${newBalance.toFixed(2)}`;
      this.txtNewBalance.style.color = newBalance > 0 ? '#16a34a' : '#dc2626';
    }
  }

  async commit(btn) {
    if (!this.currentDraft) return;
    if (!confirm('Finalize and commit this invoice?')) return;

    const cashPaid = this.inputCashPaid ? (parseFloat(this.inputCashPaid.value) || 0) : 0;
    
    // Read the optional notes input
    const notesInput = document.getElementById('inputInvoiceNotes');
    const notes = notesInput ? notesInput.value.trim() : '';

    btn.disabled = true;
    const res = await fetch(`/api/invoices/${this.currentDraft.id}/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paidAmount: cashPaid, notes }) // <-- Send notes
    });

    const data = await res.json();
    btn.disabled = false;

    if (data.error) {
      alert(`Commit Failed: ${data.error}`);
    } else {
      alert('Invoice committed successfully!');
      window.location.reload();
    }
  }
}