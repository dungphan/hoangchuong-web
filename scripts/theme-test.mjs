/*
  Unit tests for the theme toggle's state logic.

  The interaction between a stored choice and the system preference is the
  part that breaks: a naive toggle stores the theme already being shown, so
  the first click on a dark-set machine does nothing visible. None of that is
  observable from built HTML, so it is tested here.
*/
import { nextTheme } from '../assets/js/theme.js';

let failed = 0;
const eq = (actual, expected, label) => {
  if (actual === expected) {
    console.log(`  \x1b[32mPASS\x1b[0m ${label}`);
  } else {
    console.log(`  \x1b[31mFAIL\x1b[0m ${label}\n       expected ${expected}, got ${actual}`);
    failed = 1;
  }
};

console.log('==> nextTheme with an explicit choice stored');
eq(nextTheme('light', false), 'dark', 'light flips to dark');
eq(nextTheme('dark', false), 'light', 'dark flips to light');
eq(nextTheme('light', true), 'dark', 'explicit light flips to dark even on a dark system');
eq(nextTheme('dark', true), 'light', 'explicit dark flips to light even on a dark system');

console.log('==> nextTheme with no choice stored — must flip away from the system');
eq(nextTheme(null, true), 'light', 'system dark, first click goes light');
eq(nextTheme(null, false), 'dark', 'system light, first click goes dark');
eq(nextTheme(undefined, true), 'light', 'undefined behaves as unset');
eq(nextTheme('', false), 'dark', 'empty string behaves as unset');
eq(nextTheme('nonsense', true), 'light', 'an unrecognised value falls back to the system');

console.log('==> a click always changes what is displayed');
for (const systemDark of [true, false]) {
  for (const attr of [null, 'light', 'dark']) {
    const showing = attr === 'dark' || attr === 'light' ? attr : systemDark ? 'dark' : 'light';
    eq(
      nextTheme(attr, systemDark) !== showing,
      true,
      `attr=${attr} systemDark=${systemDark} → switches away from "${showing}"`
    );
  }
}

console.log(failed ? '\n\x1b[31mTHEME TESTS FAILED\x1b[0m' : '\n\x1b[32mTHEME TESTS PASS\x1b[0m');
process.exit(failed);
