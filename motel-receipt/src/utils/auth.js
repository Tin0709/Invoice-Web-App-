const AUTH_KEY = "motel_receipt_auth";

export function getAuthUser() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveAuthUser(user) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
}

export function logoutUser() {
  localStorage.removeItem(AUTH_KEY);
}

export function isLoggedIn() {
  return Boolean(getAuthUser());
}
