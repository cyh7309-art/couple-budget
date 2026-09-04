/**
 * Supabase Auth Gate — 부부 2인 계정 로그인
 * Couple Finance Dashboard ("우리집 가계부")
 *
 * 왜 필요한가:
 *   anon key 는 브라우저에 그대로 노출됩니다. 인증이 없으면 RLS 정책을 걸 수 없고,
 *   RLS 가 없으면 키를 본 누구나 가계부 전체를 읽고 지울 수 있습니다.
 *   로그인한 사용자만 데이터에 접근하도록 하여 이 구멍을 막습니다.
 */

import { getSupabase } from './supabaseClient.js';

const SKIP_KEY = 'couple_finance_skip_login';

let currentSession = null;

export function getSession() {
  return currentSession;
}

export function isAuthenticated() {
  return !!currentSession;
}

export function hasSkippedLogin() {
  return localStorage.getItem(SKIP_KEY) === '1';
}

export function clearSkipLogin() {
  localStorage.removeItem(SKIP_KEY);
}

/** 저장된 세션을 복원합니다 (오프라인에서도 캐시된 세션으로 동작) */
export async function restoreSession() {
  const sb = getSupabase();
  if (!sb || !sb.auth) return null;
  try {
    const { data } = await sb.auth.getSession();
    currentSession = data ? data.session : null;
    return currentSession;
  } catch (e) {
    console.warn('[Auth] 세션 복원 실패:', e.message || e);
    return null;
  }
}

export function onAuthChange(cb) {
  const sb = getSupabase();
  if (!sb || !sb.auth) return;
  sb.auth.onAuthStateChange((_event, session) => {
    currentSession = session;
    if (typeof cb === 'function') cb(session);
  });
}

export async function signIn(email, password) {
  const sb = getSupabase();
  if (!sb) return { ok: false, message: 'Supabase 클라이언트를 불러오지 못했습니다.' };

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: translateAuthError(error) };

  currentSession = data.session;
  clearSkipLogin();
  return { ok: true };
}

export async function signUp(email, password) {
  const sb = getSupabase();
  if (!sb) return { ok: false, message: 'Supabase 클라이언트를 불러오지 못했습니다.' };

  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) return { ok: false, message: translateAuthError(error) };

  if (data.session) {
    currentSession = data.session;
    clearSkipLogin();
    return { ok: true };
  }
  return { ok: true, needsConfirm: true };
}

export async function signOut() {
  const sb = getSupabase();
  if (sb && sb.auth) {
    try { await sb.auth.signOut(); } catch (e) { /* 무시 */ }
  }
  currentSession = null;
}

function translateAuthError(error) {
  const msg = String(error.message || '');
  if (msg.includes('Invalid login credentials')) return '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (msg.includes('already registered')) return '이미 가입된 이메일입니다. 로그인해주세요.';
  if (msg.includes('Password should be')) return '비밀번호는 6자 이상이어야 합니다.';
  if (msg.includes('Email not confirmed')) return '이메일 인증이 필요합니다. 받은 편지함을 확인해주세요.';
  if (msg.includes('valid email')) return '이메일 주소 형식이 올바르지 않습니다.';
  return msg || '알 수 없는 오류가 발생했습니다.';
}

/* ==========================================================================
   로그인 화면 (동적 생성 — index.html 을 건드리지 않습니다)
   ========================================================================== */

export function showLoginGate({ onSuccess, onSkip }) {
  if (document.getElementById('auth-gate')) return;

  const gate = document.createElement('div');
  gate.id = 'auth-gate';
  gate.className = 'auth-gate';
  gate.innerHTML = `
    <div class="auth-card">
      <div class="auth-brand">
        <span class="auth-logo">💑</span>
        <h2 class="auth-title">우리집 가계부</h2>
        <p class="auth-desc">부부 두 분만 접근할 수 있도록 로그인이 필요합니다.</p>
      </div>

      <div class="auth-form">
        <label class="form-label" for="auth-email">이메일</label>
        <input type="email" id="auth-email" class="form-input" autocomplete="username"
               placeholder="you@example.com" />

        <label class="form-label margin-top-sm" for="auth-password">비밀번호</label>
        <input type="password" id="auth-password" class="form-input" autocomplete="current-password"
               placeholder="6자 이상" />

        <div class="auth-error" id="auth-error" role="alert"></div>

        <button class="btn-primary auth-btn-main" id="auth-btn-signin">로그인</button>
        <button class="btn-secondary auth-btn-sub" id="auth-btn-signup">처음이신가요? 계정 만들기</button>

        <button class="btn-text auth-btn-skip" id="auth-btn-skip">
          로그인 없이 이 기기에서만 사용하기
        </button>
        <p class="auth-note">
          ※ 로그인하지 않으면 입력한 내용이 이 기기에만 저장되고 배우자 기기와 동기화되지 않습니다.
        </p>
      </div>
    </div>
  `;
  document.body.appendChild(gate);

  const emailEl = gate.querySelector('#auth-email');
  const pwEl = gate.querySelector('#auth-password');
  const errEl = gate.querySelector('#auth-error');
  const btnSignIn = gate.querySelector('#auth-btn-signin');
  const btnSignUp = gate.querySelector('#auth-btn-signup');
  const btnSkip = gate.querySelector('#auth-btn-skip');

  const setBusy = (busy, label) => {
    btnSignIn.disabled = busy;
    btnSignUp.disabled = busy;
    btnSignIn.textContent = busy ? (label || '처리 중…') : '로그인';
  };

  const showError = (msg) => { errEl.textContent = msg || ''; };

  const validate = () => {
    const email = emailEl.value.trim();
    const password = pwEl.value;
    if (!email) { showError('이메일을 입력해주세요.'); emailEl.focus(); return null; }
    if (!password || password.length < 6) { showError('비밀번호를 6자 이상 입력해주세요.'); pwEl.focus(); return null; }
    return { email, password };
  };

  btnSignIn.addEventListener('click', async () => {
    const creds = validate();
    if (!creds) return;
    showError('');
    setBusy(true, '로그인 중…');
    const res = await signIn(creds.email, creds.password);
    setBusy(false);
    if (res.ok) { closeLoginGate(); onSuccess && onSuccess(); }
    else showError(res.message);
  });

  btnSignUp.addEventListener('click', async () => {
    const creds = validate();
    if (!creds) return;
    showError('');
    setBusy(true, '계정 생성 중…');
    const res = await signUp(creds.email, creds.password);
    setBusy(false);
    if (!res.ok) { showError(res.message); return; }
    if (res.needsConfirm) {
      showError('가입 확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 다시 로그인해주세요.');
      return;
    }
    closeLoginGate();
    onSuccess && onSuccess();
  });

  btnSkip.addEventListener('click', () => {
    localStorage.setItem(SKIP_KEY, '1');
    closeLoginGate();
    onSkip && onSkip();
  });

  [emailEl, pwEl].forEach(el => {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) btnSignIn.click();
    });
  });

  setTimeout(() => emailEl.focus(), 100);
}

export function closeLoginGate() {
  const gate = document.getElementById('auth-gate');
  if (gate && gate.parentNode) gate.parentNode.removeChild(gate);
}
