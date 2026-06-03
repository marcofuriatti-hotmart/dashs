/**
 * Autenticação Google OAuth2 (Implicit / Redirect) — restrita ao domínio @hotmart.com
 *
 * SETUP:
 * 1. Google Cloud Console → APIs & Services → Credentials
 * 2. OAuth 2.0 Client ID tipo "Web application"
 * 3. Em "Authorized JavaScript origins":
 *    - https://marcofuriatti-hotmart.github.io
 * 4. Em "Authorized redirect URIs":
 *    - https://marcofuriatti-hotmart.github.io/dashs/
 *    - https://marcofuriatti-hotmart.github.io/dashs/app-business/
 * 5. Cole o Client ID abaixo
 */
var GOOGLE_CLIENT_ID =
  '92346177609-a8reb9845m5behppsf3nhf3u317mg68b.apps.googleusercontent.com';
var ALLOWED_DOMAIN = 'hotmart.com';
var AUTH_STORAGE_KEY = 'dashs_auth_user';
var AUTH_EXPIRY_KEY = 'dashs_auth_expiry';
var SESSION_HOURS = 8;

(function () {
  'use strict';

  function getStoredUser() {
    try {
      var expiry = localStorage.getItem(AUTH_EXPIRY_KEY);
      if (!expiry || Date.now() > parseInt(expiry)) {
        clearSession();
        return null;
      }
      var user = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY));
      return user && user.email ? user : null;
    } catch (e) {
      return null;
    }
  }

  function saveSession(user) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    localStorage.setItem(
      AUTH_EXPIRY_KEY,
      String(Date.now() + SESSION_HOURS * 3600000),
    );
  }

  function clearSession() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(AUTH_EXPIRY_KEY);
  }

  function decodeJwt(token) {
    try {
      var b = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      var raw = atob(b);
      var bytes = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      return JSON.parse(new TextDecoder('utf-8').decode(bytes));
    } catch (e) {
      return null;
    }
  }

  // ── Google OAuth2 Implicit Flow (redirect) ──
  function buildAuthUrl() {
    var redirect = window.location.href.split('#')[0].split('?')[0];
    if (redirect.match(/\/[^.\/]+$/) === null && !redirect.endsWith('/')) {
      redirect += '/';
    }
    var params = [
      'client_id=' + encodeURIComponent(GOOGLE_CLIENT_ID),
      'redirect_uri=' + encodeURIComponent(redirect),
      'response_type=id_token',
      'scope=openid email profile',
      'hd=' + ALLOWED_DOMAIN,
      'nonce=' + Math.random().toString(36).substring(2),
      'prompt=select_account',
    ];
    return 'https://accounts.google.com/o/oauth2/v2/auth?' + params.join('&');
  }

  function checkHashToken() {
    var hash = window.location.hash.substring(1);
    if (!hash) return null;
    var params = {};
    hash.split('&').forEach(function (p) {
      var kv = p.split('=');
      params[kv[0]] = decodeURIComponent(kv[1] || '');
    });
    if (!params.id_token) return null;
    history.replaceState(null, '', window.location.pathname + window.location.search);
    return params.id_token;
  }

  function processToken(idToken) {
    var payload = decodeJwt(idToken);
    if (!payload || !payload.email) return null;
    var domain = payload.email.split('@')[1];
    if (domain !== ALLOWED_DOMAIN) return 'blocked';
    return {
      email: payload.email,
      name: payload.name || payload.email,
      picture: payload.picture || '',
    };
  }

  // ── CSS ──
  var style = document.createElement('style');
  style.textContent = [
    '#auth-overlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}',
    '.auth-box{text-align:center;max-width:420px;padding:48px 40px;background:#1a1a2e;border:1px solid #2a2a40;border-radius:20px;box-shadow:0 12px 40px rgba(0,0,0,.3)}',
    '.auth-logo{font-size:48px;margin-bottom:20px}',
    '.auth-title{font-size:22px;font-weight:700;color:#fff;margin-bottom:8px;letter-spacing:-0.3px}',
    '.auth-subtitle{font-size:13px;color:#888;margin-bottom:32px;line-height:1.7}',
    '.auth-btn{display:inline-flex;align-items:center;gap:10px;padding:14px 32px;border-radius:12px;border:2px solid #2a2a40;background:#1e1e35;color:#e0e0e0;font-size:15px;font-weight:600;cursor:pointer;transition:all .2s;font-family:inherit;text-decoration:none}',
    '.auth-btn:hover{border-color:#7c3aed;box-shadow:0 4px 16px rgba(124,58,237,.2);transform:translateY(-2px)}',
    '.auth-btn svg{width:20px;height:20px}',
    '.auth-error{color:#ff6b6b;font-size:13px;margin-top:16px;display:none}',
    '.auth-user-bar{display:flex;align-items:center;gap:8px;font-size:12px;color:#ccc;position:fixed;top:12px;right:20px;z-index:100;background:#1a1a2e;border:1px solid #2a2a40;padding:6px 14px;border-radius:20px}',
    '.auth-user-bar img{width:22px;height:22px;border-radius:50%}',
    '.auth-logout{background:none;border:none;color:#888;cursor:pointer;font-size:11px;text-decoration:underline;padding:0;margin-left:6px;font-family:inherit}',
    '.auth-logout:hover{color:#ff6b6b}',
    '#app-content.auth-hidden{display:none!important}',
  ].join('\n');
  document.head.appendChild(style);

  var user = getStoredUser();

  function wrapContent() {
    var body = document.body;
    var children = Array.prototype.slice.call(body.childNodes);
    var wrapper = document.createElement('div');
    wrapper.id = 'app-content';
    if (!user) wrapper.className = 'auth-hidden';
    children.forEach(function (child) {
      wrapper.appendChild(child);
    });
    body.appendChild(wrapper);
  }

  function createOverlay(errorMsg) {
    var overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    var authUrl = buildAuthUrl();
    overlay.innerHTML =
      '<div class="auth-box">' +
      '<div class="auth-logo">📱</div>' +
      '<div class="auth-title">Hotmart App Analytics</div>' +
      '<div class="auth-subtitle">Dashboard interno com dados de uso do app.<br>Faça login com sua conta <strong>@hotmart.com</strong> para acessar.</div>' +
      '<a class="auth-btn" href="' + authUrl + '">' +
      '<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>' +
      'Entrar com Google</a>' +
      (errorMsg ? '<div class="auth-error" style="display:block">' + errorMsg + '</div>' : '') +
      '</div>';
    document.body.insertBefore(overlay, document.body.firstChild);
  }

  function showUserBar(u) {
    var bar = document.createElement('div');
    bar.className = 'auth-user-bar';
    bar.innerHTML =
      (u.picture ? '<img src="' + u.picture + '" alt="" referrerpolicy="no-referrer">' : '') +
      '<span>' + u.name + '</span>' +
      '<button class="auth-logout" id="auth-logout-btn">sair</button>';
    document.body.appendChild(bar);
    document.getElementById('auth-logout-btn').addEventListener('click', function () {
      clearSession();
      location.reload();
    });
  }

  // ── Init ──
  function init() {
    // Bypass auth local
    var loc = window.location;
    if (loc.protocol === 'file:' || loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
      return;
    }

    var idToken = checkHashToken();
    if (idToken) {
      var result = processToken(idToken);
      if (result === 'blocked') {
        wrapContent();
        createOverlay('Acesso permitido apenas para contas @' + ALLOWED_DOMAIN);
        return;
      }
      if (result) {
        user = result;
        saveSession(user);
      }
    }

    wrapContent();

    if (user) {
      showUserBar(user);
      return;
    }

    createOverlay();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
