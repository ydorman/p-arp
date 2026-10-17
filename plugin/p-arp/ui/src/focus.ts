// Keyboard focus must not stay on the page's controls, or the host's shortcuts stop working:
// keys go to the focused element instead of Logic (Space opens a dropdown instead of starting
// the transport). Logic gets a key only when the web view doesn't use it, i.e. when nothing is
// focused. WebKit doesn't focus buttons on click, but menus (<select>) keep focus after use and
// get it back when the plugin window is activated again.
//
// So: release focus after a menu selection, and whenever the plugin window loses focus (a value
// being typed commits, as when clicking elsewhere on the page).

function release() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) active.blur();
}

export function installFocusRelease() {
  document.addEventListener("change", (e) => {
    if (e.target instanceof HTMLSelectElement) e.target.blur();
  });
  window.addEventListener("blur", release);
}
