// Isolated-world bridge injected on nightlight.gg: forwards collector messages to the extension background worker.
(() => {
  if (window.__DBD_BRIDGE_INSTALLED__) return;
  window.__DBD_BRIDGE_INSTALLED__ = true;
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== 'dbd-toolbox-ext') return;
    chrome.runtime.sendMessage(event.data).catch(() => {});
  });
})();
