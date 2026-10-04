// Ambient types for the classic content scripts, which share one global namespace.

interface ContentConstants {
  MSG: Readonly<{
    HELLO: 'hello';
    SNAPSHOT: 'snapshot';
    ACTIVATE: 'activate';
    CLOSE: 'close';
    NEW: 'new';
  }>;
  HOST_TAG: string;
  STORAGE_KEY: string;
  TITLE_MAX_CHARS: number;
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

interface MountedBar {
  host: HTMLElement;
  connection: Connection;
  unmount(): void;
}

interface HoverHelperNamespace {
  constants: ContentConstants;
  instance: string;
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
  mountBar(options: MountOptions): MountedBar | null;
}

declare var HoverHelper: HoverHelperNamespace;
