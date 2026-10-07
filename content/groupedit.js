// @ts-check
// A small panel for a group's name and colour: renaming one (right-click its name on the dock)
// or making a named one (New group… on a tab). It shares the menu's layer, so bar re-renders
// never tear it down while someone types.
(() => {
  const ns = (globalThis.TabDock ??= /** @type {TabDockNamespace} */ ({}));
  const { MSG, GROUP_COLORS } = ns.constants;
  const TITLE_MAX = 100;
  /** The order Chrome itself hands out colours to new groups. */
  const SUGGESTED = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange', 'grey'];

  ns.createGroupEditor = ({ layer, win, send }) => {
    /** @type {{ panel: HTMLElement, save(): void, returnFocus: HTMLElement | null } | null} */
    let current = null;

    /** @param {{ save?: boolean, refocus?: boolean }} [how] */
    function close({ save = false, refocus = false } = {}) {
      if (!current) return;
      const { save: commit, returnFocus } = current;
      current = null;
      if (save) commit();
      layer.replaceChildren();
      if (refocus) returnFocus?.focus({ preventScroll: true });
    }
    const dismiss = () => close();

    /** @param {GroupEditOptions} options */
    function open(options) {
      close();
      const form = options.group ? renaming(options.group, send) : creating(options, send);
      const panel = buildPanel(form, () => close({ save: true, refocus: true }));
      panel.addEventListener('keydown', (event) => {
        event.stopPropagation(); // typing must never trigger the page's shortcuts
        if (event.key === 'Escape') {
          event.preventDefault();
          close({ refocus: true });
        }
      });
      for (const type of ['keyup', 'keypress']) panel.addEventListener(type, stop);
      const backdrop = document.createElement('div');
      backdrop.className = 'hh-backdrop';
      backdrop.addEventListener('pointerdown', () => close({ save: form.saveOnLeave }));
      layer.replaceChildren(backdrop, panel);
      current = { panel, save: form.save, returnFocus: options.returnFocus };
      ns.placeMenu(panel, options.point, win);
      const name = /** @type {HTMLInputElement} */ (panel.querySelector('.hh-editor-name'));
      name.focus({ preventScroll: true });
      name.select();
    }

    win.addEventListener('blur', dismiss);
    return {
      open,
      close: dismiss,
      isOpen: () => current !== null,
      dispose() {
        close();
        win.removeEventListener('blur', dismiss);
      },
    };
  };

  /** @param {Event} event */
  const stop = (event) => event.stopPropagation();

  /** Renaming: colours apply at once; the name on Enter or on clicking away. */
  /**
   * @param {BarGroup} group
   * @param {(message: ClientMessage) => void} send
   */
  function renaming(group, send) {
    const form = newForm('Edit group', group.title, group.color);
    form.onColor = (color) => send({ type: MSG.EDIT_GROUP, groupId: group.id, color });
    form.save = () => {
      const title = form.title();
      if (title !== group.title) send({ type: MSG.EDIT_GROUP, groupId: group.id, title });
    };
    form.saveOnLeave = true;
    return form;
  }

  /** Making a group: nothing exists until Enter or Create; clicking away makes nothing. */
  /**
   * @param {GroupEditOptions} options
   * @param {(message: ClientMessage) => void} send
   */
  function creating({ tabId = -1, taken = [] }, send) {
    const free = SUGGESTED.find((c) => !taken.includes(c)) ?? 'blue';
    const form = newForm('New group', '', free);
    form.action = 'Create group';
    form.save = () =>
      send({ type: MSG.NEW_GROUP, tabId, title: form.title(), color: form.color() });
    return form;
  }

  /**
   * What the panel shows and does; filled in by the caller.
   * @param {string} label @param {string} title @param {string} color
   */
  function newForm(label, title, color) {
    const form = {
      label,
      initialTitle: title,
      /** @type {string | null} */ action: null,
      saveOnLeave: false,
      /** @type {(color: chrome.tabGroups.Color) => void} */ onColor: () => {},
      save: () => {},
      title: () => title.trim(),
      color: () => /** @type {chrome.tabGroups.Color} */ (color),
      /** @param {string} next */ setTitle: (next) => (title = next),
      /** @param {string} next */ setColor: (next) => (color = next),
    };
    return form;
  }

  /**
   * @param {ReturnType<typeof newForm>} form
   * @param {() => void} submit
   */
  function buildPanel(form, submit) {
    const panel = document.createElement('div');
    panel.className = 'hh-menu hh-editor';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', form.label);
    const name = document.createElement('input');
    name.className = 'hh-editor-name';
    name.type = 'text';
    name.maxLength = TITLE_MAX;
    name.value = form.initialTitle;
    name.placeholder = 'Name this group';
    name.setAttribute('aria-label', 'Group name');
    name.addEventListener('input', () => form.setTitle(name.value));
    name.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      submit();
    });
    panel.append(name, colorRow(form));
    if (form.action) {
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'hh-editor-go';
      go.textContent = form.action;
      go.addEventListener('click', submit);
      panel.append(go);
    }
    return panel;
  }

  /** Chrome's nine group colours, the current one checked. @param {ReturnType<typeof newForm>} form */
  function colorRow(form) {
    const row = document.createElement('div');
    row.className = 'hh-colors';
    row.setAttribute('role', 'radiogroup');
    row.setAttribute('aria-label', 'Colour');
    for (const [color, hex] of Object.entries(GROUP_COLORS)) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'hh-color';
      dot.dataset.color = color;
      dot.setAttribute('role', 'radio');
      dot.setAttribute('aria-label', color[0].toUpperCase() + color.slice(1));
      dot.setAttribute('aria-checked', String(color === form.color()));
      dot.style.setProperty('--hh-swatch', hex);
      dot.addEventListener('click', () => {
        form.setColor(color);
        for (const other of row.children) other.setAttribute('aria-checked', String(other === dot));
        form.onColor(/** @type {chrome.tabGroups.Color} */ (color));
      });
      row.append(dot);
    }
    return row;
  }
})();
