export function nav(): string {
  return `
    <div class="topbar wrap">
      <div class="brand">
        <div class="logo">ACC</div>
        <div>All Card Comps</div>
      </div>
      <a href="/" data-link>Search</a>
    </div>
  `;
}

export function showToast(message: string): void {
  let toast = document.getElementById('toast');

  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add('on');
  window.setTimeout(() => toast?.classList.remove('on'), 1500);
}
