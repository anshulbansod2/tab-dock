// Ambient types for the classic content scripts, which share one global namespace.

interface ContentConstants {
  PORT_NAME: string;
  MSG: Readonly<{ SNAPSHOT: 'snapshot'; ACTIVATE: 'activate'; CLOSE: 'close'; NEW: 'new' }>;
  HOST_ID: string;
  STORAGE_KEY: string;
  TITLE_MAX_CHARS: number;
  RECONNECT_DELAYS_MS: readonly number[];
  UNGROUPED_LABEL: string;
  NEUTRAL_COLOR: string;
  GROUP_COLORS: Readonly<Record<string, string>>;
}

interface Logger {
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

interface BarView {
  snapshot: Snapshot;
  collapsed: boolean;
}

interface BarHandlers {
  onActivate(tabId: number): void;
  onClose(tabId: number): void;
  onNew(): void;
  onToggleCollapse(): void;
}

interface Connection {
  start(): void;
  stop(): void;
  send(msg: ClientMessage): void;
}

interface ConnectionOptions {
  onSnapshot(snapshot: Snapshot): void;
  onOrphaned(): void;
  runtime: typeof chrome.runtime;
  doc: Document;
}

interface MountOptions {
  doc: Document;
  runtime: typeof chrome.runtime;
  storage: chrome.storage.StorageArea;
  storageEvents: typeof chrome.storage.onChanged;
  shadowMode: ShadowRootMode;
}

interface HoverHelperNamespace {
  constants: ContentConstants;
  logger: Logger;
  styles: string;
  truncate(text: string, max: number): string;
  safeFavicon(url: string | null): string | null;
  groupLabel(group: BarGroup | null): string;
  groupColor(group: BarGroup | null): string;
  dom: Readonly<{ buildBar(view: BarView): HTMLElement; buildPill(view: BarView): HTMLElement }>;
  render(mount: HTMLElement, view: BarView): void;
  bindEvents(mount: HTMLElement, handlers: BarHandlers): void;
  createConnection(options: ConnectionOptions): Connection;
  mountBar(options: MountOptions): { host: HTMLElement; connection: Connection } | null;
}

declare var HoverHelper: HoverHelperNamespace;
