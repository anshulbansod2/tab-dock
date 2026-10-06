// Entry point: the popup with the real chrome global.
import { startPopup } from './popup.js';

void startPopup({ api: chrome, doc: document, close: () => window.close() });
