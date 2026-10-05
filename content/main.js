// @ts-check
// Entry point. Content scripts run only in the top frame (all_frames is false), once per page.
TabDock.mountBar({
  doc: document,
  runtime: chrome.runtime,
  storage: chrome.storage.local,
  storageEvents: chrome.storage.onChanged,
  shadowMode: 'closed',
});
