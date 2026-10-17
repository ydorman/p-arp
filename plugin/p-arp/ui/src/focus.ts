// Keyboard focus must not stay on the page's controls, or the host's shortcuts stop working:
// keys go to the focused element instead of Logic (Space would press a control or open a menu
// instead of starting the transport). Logic gets a key only when the web view doesn't use it,
// i.e. when nothing is focused.
//
// Menus are our own and never take focus (see Select). As a safety net, anything else that gets
// focus releases it at once, except text fields (a value being typed); and when the plugin window
// loses focus, a value being typed commits, as when clicking elsewhere on the page.

function isTextField(el: Element | null) {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

function release() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) active.blur();
}

export function installFocusRelease() {
  document.addEventListener("focusin", (e) => {
    const target = e.target;
    // blur() during the focus change itself is ignored: release right after it
    if (target instanceof HTMLElement && !isTextField(target))
      setTimeout(() => document.activeElement === target && target.blur(), 0);
  });
  window.addEventListener("blur", release);
}
