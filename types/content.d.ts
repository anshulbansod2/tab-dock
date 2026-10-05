// Ambient types for the classic content scripts, which share one global namespace.

interface ContentConstants {
  MSG: Readonly<{
    HELLO: 'hello';
    SNAPSHOT: 'snapshot';
    ACTIVATE: 'activate';
    CLOSE: 'close';
    NEW: 'new';
    MOVE: 'move';
    REGROUP: 'regroup';
    NEW_GROUP: 'newgroup';
  }>;
  HOST_TAG: string;
  STORAGE_KEY: string;
  POSITION_KEY: string;
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
  onMove(tabId: number, toIndex: number): void;
}

interface ReorderCallbacks {
  onMove(tabId: number, toIndex: number): void;
  /** A chip drag began: hold re-renders so the dragged chip isn't replaced mid-drag. */
  onDragStart(): void;
  onDragEnd(): void;
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

/** Dock position as fractions (0–1) of the space the viewport leaves around it. */
interface Placement {
  x: number;
  y: number;
}

interface Box {
  width: number;
  height: number;
}

interface DragOptions {
  host: HTMLElement;
  mount: HTMLElement;
  win: Window;
  storage: chrome.storage.StorageArea;
  storageEvents: typeof chrome.storage.onChanged;
}

interface MountedBar {
  host: HTMLElement;
  connection: Connection;
  unmount(): void;
}

interface TabDockNamespace {
  constants: ContentConstants;
  instance: string;
  logger: Logger;
  styles: string;
  safeFavicon(url: string | null): string | null;
  groupLabel(group: BarGroup | null): string;
  groupColor(group: BarGroup | null): string;
  dom: Readonly<{ buildBar(view: BarView): HTMLElement; buildPill(view: BarView): HTMLElement }>;
  render(mount: HTMLElement, view: BarView): void;
  bindEvents(mount: HTMLElement, handlers: BarHandlers): void;
  createConnection(options: ConnectionOptions): Connection;
  placement: Readonly<{
    toFraction(point: { left: number; top: number }, box: Box, viewport: Box): Placement;
    toPixels(fraction: Placement, box: Box, viewport: Box): { left: number; top: number };
  }>;
  bindDrag(options: DragOptions): { dispose(): void };
  bindReorder(mount: HTMLElement, callbacks: ReorderCallbacks): { dispose(): void };
  mountBar(options: MountOptions): MountedBar | null;
}

declare var TabDock: TabDockNamespace;
