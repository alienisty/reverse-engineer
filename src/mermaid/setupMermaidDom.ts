let domReady = false;

/** Provides browser globals required by the official mermaid package in Node. */
export async function ensureMermaidDom(): Promise<void> {
  if (domReady) {
    return;
  }

  const { Window } = await import('happy-dom');
  const window = new Window({ url: 'https://localhost' });

  Object.defineProperty(globalThis, 'window', {
    value: window,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'document', {
    value: window.document,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'HTMLElement', {
    value: window.HTMLElement,
    configurable: true,
    writable: true,
  });

  domReady = true;
}
