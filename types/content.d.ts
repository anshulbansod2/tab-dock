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
    PREVIEW: 'preview';
    PEEK: 'peek';
    RETURN: 'return';
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
  onMenu(tabId: number, point: { x: number; y: number }, tab: HTMLElement): void;
  /** A peeked tab's mini-window dock: put it back. */
  onReturn(): void;
}

interface MenuOpenOptions {
  tabId: number;
  /** Where the menu was asked for (pointer, or the focused chip's top edge). */
  point: { x: number; y: number };
  snapshot: Snapshot;
  /** Focused again when the menu closes from the keyboard or after a choice. */
  returnFocus: HTMLElement | null;
}

interface GroupMenu {
  open(options: MenuOpenOptions): void;
  close(): void;
  isOpen(): boolean;
  dispose(): void;
}

interface GroupDrop {
  show(options: {
    snapshot: Snapshot;
    tabId: number;
    dock: Pick<DOMRect, 'left' | 'top' | 'width'>;
    /** A copy of the lifted chip, carried under the pointer. */
    ghost?: HTMLElement;
  }): void;
  pick(x: number, y: number): ClientMessage | null;
  hide(): void;
}

interface ReorderCallbacks {
  onMove(tabId: number, toIndex: number): void;
  /** A chip drag began: hold re-renders so the dragged chip isn't replaced mid-drag. */
  onDragStart(): void;
  onDragEnd(): void;
  /** The chip was pulled above the dock: show the group drop targets. */
  onLift(tabId: number): void;
  /** The target under the pointer while lifted (highlighting it), or null. */
  onPick(x: number, y: number): ClientMessage | null;
  /** Hide the drop targets. */
  onLower(): void;
  onDrop(message: ClientMessage): void;
}

interface Connection {
  start(): void;
  stop(): void;
  send(msg: ClientMessage): void;
  /** Sends and resolves to the background's reply (null if it failed or is gone). */
  request(msg: ClientMessage): Promise<unknown>;
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
  dom: Readonly<{
    buildBar(view: BarView): HTMLElement;
    buildPill(view: BarView): HTMLElement;
    buildPeekBar(view: BarView): HTMLElement;
  }>;
  render(mount: HTMLElement, view: BarView): void;
  bindEvents(mount: HTMLElement, handlers: BarHandlers): void;
  createConnection(options: ConnectionOptions): Connection;
  placement: Readonly<{
    toFraction(point: { left: number; top: number }, box: Box, viewport: Box): Placement;
    toPixels(fraction: Placement, box: Box, viewport: Box): { left: number; top: number };
  }>;
  bindDrag(options: DragOptions): { dispose(): void };
  bindReorder(mount: HTMLElement, callbacks: ReorderCallbacks): { dispose(): void };
  createGroupDrop(options: { layer: HTMLElement }): GroupDrop;
  bindPreview(options: {
    mount: HTMLElement;
    layer: HTMLElement;
    win: Window;
    request(msg: ClientMessage): Promise<unknown>;
    onPeek(tabId: number, bounds: PeekBounds): void;
    now?: () => number;
  }): { hide(): void; dispose(): void };
  createGroupMenu(options: {
    layer: HTMLElement;
    win: Window;
    send(message: ClientMessage): void;
  }): GroupMenu;
  mountBar(options: MountOptions): MountedBar | null;
}

declare var TabDock: TabDockNamespace;
