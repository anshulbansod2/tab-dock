// @ts-check
// Entry point. Content scripts run only in the top frame (all_frames is false), once per page.
HoverHelper.mountBar({
  doc: document,
  runtime: chrome.runtime,
  storage: chrome.storage.local,
  storageEvents: chrome.storage.onChanged,
  shadowMode: 'closed',
});
