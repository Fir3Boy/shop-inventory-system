let currentExpectedCash = 0;

window.addEventListener('DOMContentLoaded', () => {
  setClosingToday();
});

function setClosingToday() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('closingDateInput').value = today;
  fetchDailyCashReport();
}

async function fetchDailyCashReport() {
  const dateVal = document.getElementById('closingDateInput').value;
  if (!dateVal) return;

  const res = await fetch(`/api/reports/daily-cash-closing?date=${dateVal}`);
  const data = await res.json();
  const s = data.summary;

  currentExpectedCash = s.netExpectedDrawerCash;

  document.getElementById('printMetaDetails').innerText = 
    `Business Date: ${data.targetDate} | Printed: ${new Date().toLocaleString()}`;

  // KPI Cards
  document.getElementById('txtTotalCashIn').innerText = `+SAR ${s.totalCashIn.toFixed(2)}`;
  document.getElementById('txtTotalCashOut').innerText = `-$SAR ${s.totalCashOut.toFixed(2)}`;
  document.getElementById('txtExpectedCash').innerText = `SAR ${s.netExpectedDrawerCash.toFixed(2)}`;

  // Breakdown Cards
  document.getElementById('txtSalesCash').innerText = `SAR ${s.cashFromSales.toFixed(2)}`;
  document.getElementById('txtDebtCollections').innerText = `SAR ${s.cashFromDebtCollections.toFixed(2)}`;
  document.getElementById('txtPurchasesCash').innerText = `SAR ${s.cashPaidPurchases.toFixed(2)}`;
  document.getElementById('txtSupplierDirectPayouts').innerText = `SAR ${s.cashPaidSuppliersDirect.toFixed(2)}`;
  document.getElementById('txtCustomerRefunds').innerText = `SAR ${s.cashRefunded.toFixed(2)}`;

  calculateDiscrepancy();

  // Audit Table
  const tbody = document.getElementById('cashLogsTableBody');
  if (!data.auditEntries || data.auditEntries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:#94a3b8;">No cash transactions recorded on this date.</td></tr>';
    return;
  }

  tbody.innerHTML = data.auditEntries.map(e => {
    const isIncome = e.entry_type === 'CREDIT' && e.party_type === 'CUSTOMER';
    const partyDisplay = e.party_shop ? `${e.party_shop} (${e.party_name})` : e.party_name;

    return `
      <tr>
        <td><small style="color:#64748b;">${e.time_str}</small></td>
        <td>
          <span style="font-weight:700; font-size:0.75rem; padding:2px 6px; border-radius:3px; 
                ${isIncome ? 'background:#dcfce7; color:#166534;' : 'background:#fee2e2; color:#991b1b;'}">
            ${isIncome ? 'INFLOW (+)' : 'OUTFLOW (-)'}
          </span>
        </td>
        <td><strong>${partyDisplay}</strong></td>
        <td>${e.description}</td>
        <td style="font-weight:800; color:${isIncome ? '#16a34a' : '#dc2626'};">
          ${isIncome ? '+' : '-'}SAR ${e.amount.toFixed(2)}
        </td>
      </tr>
    `;
  }).join('');
}

function calculateDiscrepancy() {
  const actualInput = document.getElementById('inputActualCash');
  const resultDiv = document.getElementById('txtDiscrepancyResult');

  if (!actualInput.value) {
    resultDiv.style.color = '#64748b';
    resultDiv.innerText = 'Enter actual cash count on the left';
    return;
  }

  const actualCount = parseFloat(actualInput.value) || 0;
  const diff = actualCount - currentExpectedCash;

  if (Math.abs(diff) < 0.01) {
    resultDiv.style.color = '#16a34a';
    resultDiv.innerText = '✅ Perfect Match! Drawer balanced ($0.00 difference).';
  } else if (diff < 0) {
    resultDiv.style.color = '#dc2626';
    resultDiv.innerText = `❌ SHORTAGE: Drawer is missing -$${Math.abs(diff).toFixed(2)}`;
  } else {
    resultDiv.style.color = '#2563eb';
    resultDiv.innerText = `⚠️ OVER: Drawer has +$${diff.toFixed(2)} extra cash`;
  }
}