/*
  Theme toggle.

  The initial theme is applied by a synchronous inline script in <head> — see
  layouts/_partials/head.html. This module only handles the click, so it can
  load deferred without causing a flash.

  nextTheme is exported and unit-tested by scripts/theme-test.mjs: the
  system-preference interaction is the part that is easy to get wrong and
  impossible to see in built HTML.
*/

/*
  Returns the theme a click should switch to.

  `attr` is the current data-theme value ('light', 'dark', or null when the
  visitor has never chosen). With no choice stored, the button must flip away
  from whatever the SYSTEM is showing — otherwise the first click on a machine
  set to dark stores 'dark' and appears to do nothing.
*/
export function nextTheme(attr, systemDark) {
  const showing = attr === 'dark' || attr === 'light' ? attr : systemDark ? 'dark' : 'light';
  return showing === 'dark' ? 'light' : 'dark';
}

function init() {
  const button = document.getElementById('theme-toggle');
  if (!button) return;

  // Rendered hidden server-side: without JS the site still follows the system
  // preference, and a button that does nothing is worse than no button.
  button.hidden = false;

  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  button.addEventListener('click', () => {
    const chosen = nextTheme(root.dataset.theme, media.matches);
    root.dataset.theme = chosen;
    try {
      localStorage.setItem('theme', chosen);
    } catch (e) {
      // Private mode or blocked storage: the theme still applies for this
      // page, it just will not be remembered. Not worth surfacing.
    }
  });
}

if (typeof document !== 'undefined') init();
