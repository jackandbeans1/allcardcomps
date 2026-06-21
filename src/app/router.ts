export function idFromPath(pathname: string = window.location.pathname): string | null {
  const match = pathname.match(/\/cards\/([^/?#]+?)(?:\.html)?\/?$/i);
  return match ? decodeURIComponent(match[1]) : null;
}

export function navigate(href: string): void {
  window.history.pushState(null, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
