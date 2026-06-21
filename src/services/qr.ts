export function getQrUrl(url: string): string { return `https://quickchart.io/qr?text=${encodeURIComponent(url)}&size=220&margin=1&ecLevel=Q`; }
