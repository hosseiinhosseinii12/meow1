/**
 * validation.js — Constraint-validation powered inline errors, email regex,
 * password strength and card formatting. Forms opt in with [data-validate].
 */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const MESSAGES = {
  valueMissing: 'This field is required.',
  typeMismatch: 'Please enter a valid value.',
  tooShort: (el) => `Please use at least ${el.minLength} characters.`,
  tooLong: (el) => `Please use no more than ${el.maxLength} characters.`,
  rangeUnderflow: (el) => `Minimum is ${el.min}.`,
  rangeOverflow: (el) => `Maximum is ${el.max}.`,
  patternMismatch: (el) => el.dataset.patternMessage ?? 'Please match the requested format.',
};

/** Score a password 0 to 3. */
export function passwordStrength(pw = '') {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length >= 14 && score === 2) score++;
  return Math.min(3, pw ? Math.max(1, score) : 0);
}

/** Luhn check for card numbers. */
export function luhn(num) {
  const d = num.replace(/\D/g, '');
  if (d.length < 13) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) { let n = Number(d[d.length - 1 - i]); if (i % 2) { n *= 2; if (n > 9) n -= 9; } sum += n; }
  return sum % 10 === 0;
}

export function validateField(el) {
  const field = el.closest('.field');
  let msg = '';
  el.setCustomValidity('');
  if (el.type === 'email' && el.value && !EMAIL_RE.test(el.value)) el.setCustomValidity('Please enter a valid email address.');
  if (el.dataset.match) { const other = el.form?.querySelector(el.dataset.match); if (other && other.value !== el.value) el.setCustomValidity('Passwords do not match.'); }
  if (el.dataset.luhn !== undefined && el.value && !luhn(el.value)) el.setCustomValidity('Please check your card number.');
  if (el.dataset.expiry !== undefined && el.value) {
    const [m, y] = el.value.split('/').map(Number);
    const now = new Date(); const exp = new Date(2000 + y, m);
    if (!m || m > 12 || !y || exp < now) el.setCustomValidity('Please enter a valid future expiry.');
  }
  if (!el.checkValidity()) {
    const v = el.validity;
    msg = el.validationMessage;
    for (const k of Object.keys(MESSAGES)) if (v[k]) { const m = MESSAGES[k]; msg = typeof m === 'function' ? m(el) : m; }
    if (v.customError) msg = el.validationMessage;
    if (el.type === 'email' && v.typeMismatch) msg = 'Please enter a valid email address.';
  }
  if (field) {
    field.classList.toggle('is-invalid', Boolean(msg));
    field.classList.toggle('is-valid', !msg && Boolean(el.value) && el.type !== 'checkbox');
    let err = field.querySelector('.field__error');
    if (!err) { err = Object.assign(document.createElement('p'), { className: 'field__error' }); field.append(err); }
    err.id ||= `${el.id || el.name}-error`;
    err.textContent = msg;
    el.setAttribute('aria-invalid', String(Boolean(msg)));
    el.setAttribute('aria-describedby', err.id);
  }
  return !msg;
}

export function validateScope(scope) {
  const els = [...scope.querySelectorAll('input, select, textarea')].filter((el) => !el.disabled && el.type !== 'hidden' && el.offsetParent !== null);
  const results = els.map(validateField);
  const firstBad = els[results.indexOf(false)];
  firstBad?.focus();
  return results.every(Boolean);
}

export function initValidation(root = document) {
  root.querySelectorAll('form[data-validate]').forEach((form) => {
    form.noValidate = true;
    form.addEventListener('blur', (e) => { if (e.target.matches('input, select, textarea') && e.target.value) validateField(e.target); }, true);
    form.addEventListener('input', (e) => { if (e.target.closest('.field.is-invalid')) validateField(e.target); });
    form.addEventListener('submit', (e) => { if (!validateScope(form)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  });
  // Password strength meters
  root.querySelectorAll('[data-strength]').forEach((input) => {
    const meter = document.getElementById(input.dataset.strength);
    const label = meter?.nextElementSibling;
    input.addEventListener('input', () => {
      const s = passwordStrength(input.value);
      meter.dataset.level = s;
      if (label) label.textContent = ['Use eight or more characters', 'Weak: add capitals and numbers', 'Good: add a symbol for strength', 'Strong password'][s];
    });
  });
  // Show / hide password
  root.addEventListener?.('click', () => {});
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-toggle-password]');
    if (!t) return;
    const input = t.parentElement.querySelector('input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    t.setAttribute('aria-pressed', String(show));
    t.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    t.innerHTML = show ? '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="M2 2l20 20"/></svg>' : '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  });
}

/** Input masks for card fields. */
export function maskCard(input) { input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 '); }); }
export function maskExpiry(input) { input.addEventListener('input', (e) => { let v = input.value.replace(/\D/g, '').slice(0, 4); if (v.length >= 3) v = `${v.slice(0, 2)}/${v.slice(2)}`; else if (v.length === 2 && e.inputType !== 'deleteContentBackward') v += '/'; input.value = v; }); }
export function maskDigits(input, max = 4) { input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, max); }); }
