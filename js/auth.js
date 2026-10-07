/**
 * auth.js — Front-end session mock for sign in, registration, and password
 * recovery. No credentials leave the browser; only a display name is kept.
 */
import { Store, $ } from './state.js';
import { toast } from './toast.js';
import { initValidation } from './validation.js';

export class Auth {
  static get user() { return Store.get('session', null); }
  static signIn(user) { Store.set('session', { name: user.name, email: user.email, at: Date.now() }); }
  static signOut() { Store.remove('session'); Store.set('session', null); }
}

const nameFromEmail = (email) => email.split('@')[0].split(/[._-]/).map((s) => s[0]?.toUpperCase() + s.slice(1)).join(' ');

export function initAuth() {
  initValidation(document);
  const submitWith = (form, fn) => form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true; const label = btn.textContent; btn.textContent = 'One moment';
    setTimeout(() => { btn.disabled = false; btn.textContent = label; fn(new FormData(form)); }, 700);
  });
  submitWith($('#login-form'), (fd) => {
    Auth.signIn({ email: fd.get('email'), name: nameFromEmail(String(fd.get('email'))) });
    toast({ type: 'success', title: 'Welcome back', message: 'Taking you to your atelier.' });
    const next = new URLSearchParams(location.search).get('next') ?? 'account.html';
    setTimeout(() => (location.href = next.startsWith('/') || next.includes('//') ? 'account.html' : next), 800);
  });
  submitWith($('#register-form'), (fd) => {
    if (!fd.get('terms')) { toast({ type: 'error', title: 'Please accept the terms' }); return; }
    Auth.signIn({ email: fd.get('email'), name: `${fd.get('first')} ${fd.get('last')}` });
    toast({ type: 'success', title: 'Your account is ready', message: 'Welcome to Maison Verdant.' });
    setTimeout(() => (location.href = 'account.html'), 900);
  });
  submitWith($('#forgot-form'), (fd) => {
    $('#forgot-form').hidden = true;
    const done = $('#forgot-done'); done.hidden = false;
    done.querySelector('[data-email]').textContent = fd.get('email');
  });
  submitWith($('#reset-form'), () => {
    toast({ type: 'success', title: 'Password updated', message: 'You can now sign in with your new password.' });
    setTimeout(() => (location.href = 'login.html'), 1000);
  });
  document.addEventListener('click', (e) => {
    const s = e.target.closest('[data-social]');
    if (s) toast({ type: 'info', title: `${s.dataset.social} sign in`, message: 'Connect a provider in your deployment to enable this.' });
  });
}
