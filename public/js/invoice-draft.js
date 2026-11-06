class InvoiceDraftEngine {
  constructor(invoiceType, partySelectId, tableBodyId) {
    this.type = invoiceType; // 'OUT' or 'IN'
    this.isReturn = false;   // true = Customer Return (Credit Note) or Supplier Return (Debit Note)
    
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

  // ---------------------------------------------------------------------
  // 1. MODE SWITCHER (Sale vs Return / Purchase vs Debit Note)
  // ---------------------------------------------------------------------
  async setMode(isReturn) {
    if (this.isReturn === isReturn) return;
    this.isReturn = isReturn;

    const btnMain = document.getElementById(this.type === 'OUT' ? 'btnModeSale' : 'btnModePurchase');
    const btnReturn = document.getElementById('btnModeReturn');
    const title = document.getElementById('txtInvoiceTitle');
    const billLabel = document.getElementById('txtBillTotalLabel');
    const cashLabel = document.getElementById('lblCashPaid');
    const commitBtn = document.getElementById('btnCommitInvoice');
    const panel = document.getElementById('invoicePanel');
    const notesLabel = document.getElementById('lblNotes');

    if (this.isReturn) {
      btnReturn.style.background = '#d97706';
      btnReturn.style.color = '#fff';
      if (btnMain) {
        btnMain.style.background = '#cbd5e1';
        btnMain.style.color = '#475569';
      }

      panel.style.borderTop = '5px solid #d97706';

      if (this.type === 'OUT') {
        title.innerText = '🔄 Customer Return (Credit Note)';
        billLabel.innerText = 'Return Credit Value:';
        cashLabel.innerText = 'Cash Refund Given Out (SAR ):';
        commitBtn.innerText = '✓ COMMIT RETURN & RESTOCK';
      } else {
        title.innerText = '🔄 Supplier Return (Debit Note)';
        billLabel.innerText = 'Debit Note Value (Less Owed):';
        cashLabel.innerText = 'Cash Refund Received from Mill (SAR ):';
        commitBtn.innerText = '✓ COMMIT RETURN TO MILL';
        if (notesLabel) notesLabel.innerText = 'Debit Bilty / Ref:';
      }

      title.style.color = '#d97706';
      commitBtn.style.background = '#d97706';
    } else {
      if (btnMain) {
        btnMain.style.background = this.type === 'OUT' ? '#2563eb' : '#7c3aed';
        btnMain.style.color = '#fff';
      }
      btnReturn.style.background = '#cbd5e1';
      btnReturn.style.color = '#475569';

      panel.style.borderTop = 'none';

      if (this.type === 'OUT') {
        title.innerText = 'Customer Sales Invoice';
        billLabel.innerText = 'Bill Total:';
        cashLabel.innerText = 'Cash Received (SAR ):';
        commitBtn.innerText = '✓ COMMIT SALE';
        commitBtn.style.background = '#16a34a';
      } else {
        title.innerText = 'Stock IN (Supplier Purchase)';
        billLabel.innerText = 'Current Inward Total:';
        cashLabel.innerText = 'Cash Paid to Supplier (SAR ):';
        commitBtn.innerText = '+ COMMIT STOCK IN (PURCHASE)';
        commitBtn.style.background = '#7c3aed';
        if (notesLabel) notesLabel.innerText = 'Mill Bill #:';
      }
      title.style.color = '#0f172a';
    }

    // Creates new draft with correct isReturn flag sent to server
    await this.createNewDraft();
  }

  // ---------------------------------------------------------------------
  // 2. DRAFT LIFECYCLE (Creates Draft with isReturn sent to API)
  // ---------------------------------------------------------------------
  async createNewDraft() {
    if (!this.currentParty) return;

    const res = await fetch('/api/invoices/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        partyId: this.currentParty.id, 
        type: this.type,
        isReturn: this.isReturn // <-- Correctly sends true or false
      })
    });
    this.currentDraft = await res.json();
    
    const notesInput = document.getElementById('inputInvoiceNotes');
    if (notesInput) notesInput.value = '';

    this.renderTable([]);
  }

  // ---------------------------------------------------------------------
  // 3. PARTIES & BALANCES
  // ---------------------------------------------------------------------
  // 1. Fetch parties from API on page load
  async loadParties() {
    const filter = this.type === 'OUT' ? 'CUSTOMER' : 'SUPPLIER';
    const res = await fetch(`/api/parties?type=${filter}`);
    this.partiesList = await res.json();

    // Render full list initially
    this.renderPartyOptions(this.partiesList);
  }

  // 2. Render options into <select id="partySelect">
  renderPartyOptions(parties) {
    if (!parties || parties.length === 0) {
      this.partySelect.innerHTML = '<option value="">No matching parties found</option>';
      this.currentParty = null;
      if (this.txtOldBalance) this.txtOldBalance.innerText = 'SAR 0.00';
      return;
    }

    // Preserve currently selected party if still in filtered list
    const previousSelectedId = this.currentParty ? this.currentParty.id : null;

    this.partySelect.innerHTML = parties.map(p => {
      let displayName = '';

      if (this.type === 'OUT') {
        displayName = p.shop_name 
          ? `🏪 ${p.shop_name} (${p.name})` 
          : `👤 ${p.name}`;

        return `<option value="${p.id}">${displayName} &nbsp;—&nbsp; Debt: SAR ${p.current_balance.toFixed(2)}</option>`;
      } else {
        displayName = p.shop_name 
          ? `🏭 ${p.shop_name} (Rep: ${p.name})` 
          : `👤 ${p.name}`;

        const owed = p.current_balance < 0 ? Math.abs(p.current_balance) : 0;
        return `<option value="${p.id}">${displayName} &nbsp;—&nbsp; Owed: SAR ${owed.toFixed(2)}</option>`;
      }
    }).join('');

    // Restore previous selection if possible, otherwise select first match
    if (previousSelectedId && parties.some(p => p.id === previousSelectedId)) {
      this.partySelect.value = previousSelectedId;
    } else {
      this.partySelect.value = parties[0].id;
    }

    this.handlePartyChange();
  }

  // 3. Live filter triggered by typing in <input id="partySearchInput">
  filterParties(query) {
    const term = (query || '').toLowerCase().trim();

    if (!term) {
      this.renderPartyOptions(this.partiesList);
      return;
    }

    const filtered = this.partiesList.filter(p => {
      return (p.name && p.name.toLowerCase().includes(term)) ||
             (p.shop_name && p.shop_name.toLowerCase().includes(term)) ||
             (p.phone && p.phone.includes(term)) ||
             (p.secondary_phone && p.secondary_phone.includes(term)) ||
             (p.city && p.city.toLowerCase().includes(term));
    });

    this.renderPartyOptions(filtered);
  }

  // 4. Update balance display and draft when party changes
  async handlePartyChange() {
    const partyId = parseInt(this.partySelect.value);
    this.currentParty = this.partiesList.find(p => p.id === partyId) || null;

    if (this.txtOldBalance && this.currentParty) {
      if (this.type === 'OUT') {
        this.txtOldBalance.innerText = `SAR ${this.currentParty.current_balance.toFixed(2)}`;
      } else {
        const owed = this.currentParty.current_balance < 0 ? Math.abs(this.currentParty.current_balance) : 0;
        this.txtOldBalance.innerText = `SAR ${owed.toFixed(2)}`;
      }
    }

    await this.createNewDraft();
  }

  // ---------------------------------------------------------------------
  // 4. MODAL CONTROLS & DUAL-UNIT SELECTION
  // ---------------------------------------------------------------------
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

  setUnit(unit) {
    this.currentUnit = unit;
    document.getElementById('btnUnitCarton').className = `unit-btn ${unit === 'CARTON' ? 'active' : ''}`;
    document.getElementById('btnUnitSpool').className = `unit-btn ${unit === 'SPOOL' ? 'active' : ''}`;

    const lastCostSpool = this.selectedProduct.last_cost_spool || 0;
    const ratio = this.selectedProduct.spools_per_carton;
    const unitCost = unit === 'CARTON' ? (lastCostSpool * ratio) : lastCostSpool;

    const hintEl = document.getElementById('txtLastCostHint');
    if (hintEl) {
      hintEl.innerText = `Last Cost: SAR ${unitCost.toFixed(2)} / ${unit === 'CARTON' ? 'Ctn' : 'Spool'}`;
    }

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

  updateMarginDisplay() {
    const feedbackEl = document.getElementById('txtMarginFeedback');
    if (!feedbackEl || !this.selectedProduct) return;

    const currentPrice = parseFloat(document.getElementById('modalPriceInput').value) || 0;
    const lastCostSpool = this.selectedProduct.last_cost_spool || 0;
    const ratio = this.selectedProduct.spools_per_carton;
    const prevCost = this.currentUnit === 'CARTON' ? (lastCostSpool * ratio) : lastCostSpool;

    const diff = currentPrice - prevCost;
    const percentChange = prevCost > 0 ? ((diff / prevCost) * 100).toFixed(1) : 0;

    if (this.type === 'OUT') {
      if (diff < 0) {
        feedbackEl.style.color = '#dc2626';
        feedbackEl.innerText = `⚠️ Selling BELOW cost! (-SAR ${Math.abs(diff).toFixed(2)} loss/unit)`;
      } else if (diff === 0) {
        feedbackEl.style.color = '#64748b';
        feedbackEl.innerText = `Break-even (SAR 0.00 profit)`;
      } else {
        feedbackEl.style.color = '#16a34a';
        feedbackEl.innerText = `✅ Profit: +SAR ${diff.toFixed(2)} per unit (+${percentChange}%)`;
      }
    } else {
      if (diff > 0) {
        feedbackEl.style.color = '#ea580c';
        feedbackEl.innerText = `📈 Price INCREASE: +SAR ${diff.toFixed(2)} (+${percentChange}%) higher than last batch`;
      } else if (diff < 0) {
        feedbackEl.style.color = '#16a34a';
        feedbackEl.innerText = `📉 Price DECREASE: -SAR ${Math.abs(diff).toFixed(2)} (-${Math.abs(percentChange)}%) cheaper than last batch`;
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
          <td>SAR ${item.unit_price.toFixed(2)}</td>
          <td>SAR ${item.line_total.toFixed(2)}</td>
          <td><button class="btn-delete-row" onclick="draftEngine.removeItem(${item.id})">&times;</button></td>
        </tr>
      `;
    }).join('');

    this.currentBillTotal = total;
    this.calculateBalances();
  }

  // ---------------------------------------------------------------------
  // 5. FINANCIAL CALCULATIONS & BALANCE UPDATES
  // ---------------------------------------------------------------------
  calculateBalances() {
    if (this.txtBillTotal) {
      this.txtBillTotal.innerText = `SAR ${this.currentBillTotal.toFixed(2)}`;
    }

    const cashInput = this.inputCashPaid ? (parseFloat(this.inputCashPaid.value) || 0) : 0;
    const oldBalance = this.currentParty ? this.currentParty.current_balance : 0;

    let newBalance = oldBalance;

    if (this.type === 'OUT') {
      if (this.isReturn) {
        // Customer Return: Returning goods reduces customer debt (- billTotal)
        // If cash refund is given to customer, it adds back (+ cashInput)
        newBalance = oldBalance - this.currentBillTotal + cashInput;
      } else {
        // Standard Sale: Increases debt (+ billTotal) - cash received (- cashInput)
        newBalance = oldBalance + this.currentBillTotal - cashInput;
      }
    } else {
      // Supplier Transactions
      if (this.isReturn) {
        // Supplier Return (Debit Note): Returning defective goods reduces what we owe (balance moves closer to 0 / positive)
        newBalance = oldBalance + this.currentBillTotal - cashInput;
      } else {
        // Inward Purchase: Increases what we owe (- billTotal) + cash paid (+ cashInput)
        newBalance = oldBalance - this.currentBillTotal + cashInput;
      }
    }

    if (this.txtNewBalance) {
      if (this.type === 'OUT') {
        this.txtNewBalance.innerText = `SAR ${newBalance.toFixed(2)}`;
        this.txtNewBalance.style.color = newBalance > 0 ? '#16a34a' : '#64748b';
      } else {
        const owed = newBalance < 0 ? Math.abs(newBalance) : 0;
        this.txtNewBalance.innerText = `SAR ${owed.toFixed(2)} ${newBalance < 0 ? '(Owed)' : '(Surplus)'}`;
        this.txtNewBalance.style.color = owed > 0 ? '#dc2626' : '#16a34a';
      }
    }
  }

  setFullCash() {
    if (this.inputCashPaid) {
      this.inputCashPaid.value = this.currentBillTotal.toFixed(2);
      this.calculateBalances();
    }
  }

  // ---------------------------------------------------------------------
  // 6. COMMIT TRANSACTION
  // ---------------------------------------------------------------------
  async commit(btn) {
    if (!this.currentDraft) return;

    let actionText = '';
    if (this.type === 'OUT') {
      actionText = this.isReturn ? 'CUSTOMER RETURN (Restock Goods)' : 'SALE';
    } else {
      actionText = this.isReturn ? 'SUPPLIER RETURN (Debit Note)' : 'INWARD PURCHASE';
    }

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
      alert(this.isReturn ? 'Return processed and ledger updated!' : 'Invoice committed successfully!');
      window.location.reload();
    }
  }
}