// Cuenta bytes recibidos; si el servidor no informa un total, la barra es indeterminada.
export async function readWithProgress(response, onProgress) {
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.url}`);
  const total = response.headers.get('content-encoding') ? 0 : Number(response.headers.get('content-length'));
  if (!response.body) return response.blob();
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  onProgress(0, total);
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress(received, total);
  }
  return new Blob(chunks);
}

export async function downloadOBJ(url, onProgress, compressed = false) {
  if (compressed && typeof DecompressionStream !== 'undefined') {
    const response = await fetch(`${url}.gz`);
    if (response.ok && !response.headers.get('content-type')?.includes('text/html')) {
      const blob = await readWithProgress(response, onProgress);
      const header = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
      if (header[0] === 0x1f && header[1] === 0x8b) {
        return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
      }
      // Algunos servidores ya descomprimen al enviar Content-Encoding: gzip.
      if (response.headers.get('content-encoding')?.includes('gzip')) return blob.text();
    }
  }
  return (await readWithProgress(await fetch(url), onProgress)).text();
}

export function createLoadingScreen() {
  const panel = document.querySelector('#loading');
  const progress = document.querySelector('#load-progress');
  const label = document.querySelector('#load-status');
  return {
    download(received, total) {
      if (total > 0) { progress.max = total; progress.value = Math.min(received, total); }
      else progress.removeAttribute('value');
      label.textContent = total > 0
        ? `Descargando museo: ${Math.min(100, Math.round(received / total * 100))}%`
        : `Descargando museo: ${(received / 1e6).toFixed(1)} MB`;
    },
    async stage(message) {
      label.textContent = message;
      progress.removeAttribute('value');
      // Pintar el estado antes de comenzar trabajo de geometría en CPU.
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    },
    finish() { panel.hidden = true; },
    fail() { progress.hidden = true; label.textContent = 'No se pudo completar la carga. Recarga para reintentar.'; },
  };
}
