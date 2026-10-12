const $ = (id) => document.getElementById(id);
const money = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0
});
const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

const fields = {
  amount: $('loanAmount'),
  rate: $('interestRate'),
  years: $('tenure'),
  extra: $('extraPayment'),
  extraEnabled: $('extraEnabled')
};

let current = null;
let scheduleExpanded = false;
let lastValidValues = { amount: 1000000, rate: 8.5, years: 5, extra: 2000, extraEnabled: true };

function formatMoney(value) {
  return money.format(Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
}
function formatCompact(value) {
  const n = Math.abs(value);
  if (n >= 10000000) return `₹${(value / 10000000).toFixed(2)}Cr`;
  if (n >= 100000) return `₹${(value / 100000).toFixed(2)}L`;
  if (n >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return formatMoney(value);
}
function calculateEmi(principal, annualRate, months) {
  if (months <= 0 || principal <= 0) return 0;
  const monthlyRate = annualRate / 1200;
  if (monthlyRate === 0) return principal / months;
  const factor = Math.pow(1 + monthlyRate, months);
  return principal * monthlyRate * factor / (factor - 1);
}
function buildSchedule(principal, annualRate, months, extra = 0) {
  const monthlyRate = annualRate / 1200;
  const baseEmi = calculateEmi(principal, annualRate, months);
  let balance = principal;
  const rows = [];
  let totalInterest = 0;
  let actualMonths = 0;
  while (balance > 0.005 && actualMonths < 361) {
    const interest = balance * monthlyRate;
    const payment = Math.min(balance + interest, baseEmi + extra);
    const principalPaid = Math.max(0, payment - interest);
    balance = Math.max(0, balance - principalPaid);
    totalInterest += interest;
    actualMonths++;
    const year = Math.ceil(actualMonths / 12);
    if (!rows[year - 1]) rows[year - 1] = { year, principal: 0, interest: 0, balance: 0 };
    rows[year - 1].principal += principalPaid;
    rows[year - 1].interest += interest;
    rows[year - 1].balance = balance;
  }
  return { rows, totalInterest, actualMonths, baseEmi };
}
function readValues() {
  return {
    amount: Number(fields.amount.value),
    rate: Number(fields.rate.value),
    years: Number(fields.years.value),
    extra: fields.extraEnabled.checked ? Math.max(0, Number(fields.extra.value) || 0) : 0,
    extraEnabled: fields.extraEnabled.checked
  };
}
function validate(values) {
  const errors = {
    amount: values.amount >= 10000 && values.amount <= 50000000 && Number.isFinite(values.amount),
    rate: values.rate >= 0 && values.rate <= 30 && Number.isFinite(values.rate),
    years: Number.isInteger(values.years) && values.years >= 1 && values.years <= 30,
    extra: Number(fields.extra.value) >= 0 && Number(fields.extra.value) <= 1000000
  };
  $('amountError').textContent = errors.amount ? '' : 'Enter an amount between ₹10,000 and ₹5 crore.';
  $('rateError').textContent = errors.rate ? '' : 'Enter an interest rate from 0% to 30%.';
  $('tenureError').textContent = errors.years ? '' : 'Enter a whole number from 1 to 30 years.';
  fields.extra.setAttribute('aria-invalid', String(!errors.extra));
  if (!errors.extra) $('tenureError').textContent += ' Extra payment must be between ₹0 and ₹10,00,000.';
  return Object.values(errors).every(Boolean);
}
function calculateAndRender() {
  const values = readValues();
  if (!validate(values)) return;
  lastValidValues = { ...values };
  const months = values.years * 12;
  const base = buildSchedule(values.amount, values.rate, months, 0);
  const withExtra = buildSchedule(values.amount, values.rate, months, values.extra);
  const totalRepayment = values.amount + base.totalInterest;
  const interestShare = totalRepayment ? base.totalInterest / totalRepayment * 100 : 0;
  const principalShare = totalRepayment ? values.amount / totalRepayment * 100 : 100;
  current = { ...values, months, emi: base.baseEmi, interest: base.totalInterest, totalRepayment, interestShare, principalShare, base, withExtra };

  $('monthlyEmi').textContent = formatMoney(base.baseEmi);
  $('planetPrincipal').textContent = formatMoney(values.amount);
  $('planetPrincipalShare').textContent = `${principalShare.toFixed(1)}% of total`;
  $('planetInterest').textContent = formatMoney(base.totalInterest);
  $('planetInterestShare').textContent = `${interestShare.toFixed(1)}% of total`;
  $('planetTenure').textContent = `${values.years} ${values.years === 1 ? 'year' : 'years'}`;
  $('planetMonths').textContent = `${months} months`;
  $('planetRepayment').textContent = formatMoney(totalRepayment);

  $('insightRepayment').textContent = formatMoney(totalRepayment);
  $('insightShare').textContent = `${interestShare.toFixed(1)}%`;
  $('insightTenure').textContent = `${values.years} ${values.years === 1 ? 'year' : 'years'}`;
  $('insightMonths').textContent = `${months} monthly payments`;
  $('insightEmi').textContent = formatMoney(base.baseEmi);

  $('donutTotal').textContent = formatCompact(totalRepayment);
  $('breakPrincipal').textContent = formatMoney(values.amount);
  $('breakInterest').textContent = formatMoney(base.totalInterest);
  $('breakPrincipalShare').textContent = `${principalShare.toFixed(1)}%`;
  $('breakInterestShare').textContent = `${interestShare.toFixed(1)}%`;
  $('donutChart').style.setProperty('--principal', `${principalShare}%`);
  $('donutChart').setAttribute('aria-label', `Principal ${principalShare.toFixed(1)} percent, interest ${interestShare.toFixed(1)} percent`);

  renderSchedule(base.rows);
  renderShock();
  renderSuggestion();
  $('scenarioResult').classList.remove('show');
  $('scenarioResult').textContent = '';
}
function renderSchedule(rows) {
  const tbody = $('scheduleBody');
  tbody.innerHTML = '';
  const shownRows = scheduleExpanded ? rows : rows.slice(0, 5);
  shownRows.forEach(row => {
    const tr = document.createElement('tr');
    [row.year, number.format(Math.round(row.principal)), number.format(Math.round(row.interest)), number.format(Math.round(row.balance))].forEach(value => {
      const td = document.createElement('td');
      td.textContent = value;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  $('toggleSchedule').textContent = scheduleExpanded ? 'Show less ↑' : 'View full schedule →';
  $('scheduleNote').textContent = rows.length > 5 && !scheduleExpanded
    ? `Showing first 5 of ${rows.length} years. Select “View full schedule” for the rest.`
    : 'Yearly estimates based on the selected loan details.';
}
function renderShock() {
  if (!current) return;
  const change = Number($('shockSlider').value);
  const shockedRate = Math.min(30, Math.max(0, current.rate + change));
  const shockedEmi = calculateEmi(current.amount, shockedRate, current.months);
  $('shockOutput').textContent = `${change > 0 ? '+' : ''}${change}%`;
  $('currentRateLabel').textContent = `${current.rate.toFixed(2).replace(/\.00$/, '')}%`;
  $('changedRateLabel').textContent = `${shockedRate.toFixed(2).replace(/\.00$/, '')}%`;
  $('currentShockEmi').textContent = formatMoney(current.emi);
  $('changedShockEmi').textContent = formatMoney(shockedEmi);
  const difference = shockedEmi - current.emi;
  $('shockDifference').textContent = `${difference > 0 ? '+' : difference < 0 ? '−' : ''}${formatMoney(Math.abs(difference))}`;
  $('shockDifference').style.color = difference > 0 ? '#e16b27' : difference < 0 ? '#079c78' : '#66729b';
}
function renderSuggestion() {
  const { extra, withExtra, base, emi } = current;
  const saved = Math.max(0, base.totalInterest - withExtra.totalInterest);
  const monthsSaved = Math.max(0, base.actualMonths - withExtra.actualMonths);
  const suggestion = $('smartSuggestion');
  if (extra > 0 && saved > 0) {
    suggestion.textContent = `Adding ${formatMoney(extra)} per month could save about ${formatMoney(saved)} in interest and finish around ${monthsSaved} month${monthsSaved === 1 ? '' : 's'} earlier.`;
  } else {
    suggestion.textContent = `Try adding an extra monthly payment to estimate potential interest savings and an earlier debt-free date.`;
  }
}
function showScenario(message) {
  const result = $('scenarioResult');
  result.textContent = message;
  result.classList.add('show');
}
function handleScenario(type) {
  if (!current) return;
  const v = current;
  if (type === 'shorter') {
    if (v.years === 1) return showScenario('You are already using the shortest available tenure of 1 year. Try a longer tenure to reduce the monthly payment, while noting that it may increase total interest.');
    const years = Math.max(1, v.years - 1);
    const scenario = buildSchedule(v.amount, v.rate, years * 12);
    showScenario(`Shorter tenure (${years} years): EMI would be ${formatMoney(scenario.baseEmi)} instead of ${formatMoney(v.emi)}. Estimated interest would be ${formatMoney(scenario.totalInterest)}, a difference of ${formatMoney(v.interest - scenario.totalInterest)}.`);
  } else if (type === 'rate') {
    const rate = Math.max(0, v.rate - 1);
    const scenario = buildSchedule(v.amount, rate, v.months);
    showScenario(`One percentage point lower (${rate}%): EMI would be ${formatMoney(scenario.baseEmi)} and estimated interest would be ${formatMoney(scenario.totalInterest)}. You could save about ${formatMoney(v.interest - scenario.totalInterest)} in interest over the original tenure.`);
  } else if (type === 'down') {
    const reducedAmount = v.amount * 0.9;
    const scenario = buildSchedule(reducedAmount, v.rate, v.months);
    showScenario(`Imagine borrowing 10% less (${formatMoney(reducedAmount)}): EMI would be ${formatMoney(scenario.baseEmi)} and interest about ${formatMoney(scenario.totalInterest)}. This illustrative scenario assumes the loan principal is reduced while rate and tenure stay the same.`);
  } else {
    fields.amount.value = lastValidValues.amount;
    fields.rate.value = lastValidValues.rate;
    fields.years.value = lastValidValues.years;
    fields.extra.value = lastValidValues.extra;
    fields.extraEnabled.checked = lastValidValues.extraEnabled;
    calculateAndRender();
    showScenario('Back to your custom loan inputs. Change any value on the left and recalculate to explore another scenario.');
  }
}
const detailContent = {
  principal: ['Principal amount', () => `This is the amount you borrow: ${formatMoney(current.amount)}. It does not include the interest charged by the lender.`],
  interest: ['Total interest', () => `Across the planned ${current.months}-month tenure, estimated interest is ${formatMoney(current.interest)}. Your lender's actual schedule may differ.`],
  tenure: ['Loan tenure', () => `Your selected term is ${current.years} year${current.years === 1 ? '' : 's'}, or ${current.months} monthly payments.`],
  repayment: ['Total repayment', () => `Principal plus estimated interest equals ${formatMoney(current.totalRepayment)} over the original tenure, before considering optional extra payments.`],
  emi: ['Monthly EMI', () => `Your estimated regular EMI is ${formatMoney(current.emi)}. Optional extra payments are shown separately in the savings estimate.`]
};
function openDetail(type) {
  if (!current || !detailContent[type]) return;
  const [title, body] = detailContent[type];
  $('popoverTitle').textContent = title;
  $('popoverText').textContent = body();
  $('detailPopover').classList.add('show');
}
$('loanForm').addEventListener('submit', event => {
  event.preventDefault();
  calculateAndRender();
});
[fields.amount, fields.rate, fields.years, fields.extra].forEach(input => {
  input.addEventListener('input', () => {
    // Live updates occur only while all values are valid, avoiding misleading partial calculations.
    const values = readValues();
    if (validate(values)) calculateAndRender();
  });
});
fields.extraEnabled.addEventListener('change', calculateAndRender);
$('shockSlider').addEventListener('input', renderShock);
$('toggleSchedule').addEventListener('click', () => {
  scheduleExpanded = !scheduleExpanded;
  if (current) renderSchedule(current.base.rows);
});
document.querySelectorAll('[data-detail]').forEach(button => {
  button.addEventListener('click', () => openDetail(button.dataset.detail));
});
$('closePopover').addEventListener('click', () => $('detailPopover').classList.remove('show'));
document.querySelectorAll('[data-scenario]').forEach(button => {
  button.addEventListener('click', () => handleScenario(button.dataset.scenario));
});
$('planButton').addEventListener('click', () => {
  $('loanAmount').focus();
  $('loanForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
});

calculateAndRender();
