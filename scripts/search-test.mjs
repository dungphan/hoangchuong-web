/*
  Unit tests for the catalogue search matcher.

  scripts/test.sh greps built HTML, which cannot observe any of this: accent
  folding, đ handling, and code punctuation are pure runtime behaviour. A
  search box that renders perfectly and matches nothing would pass every
  assertion in that file, so the matcher is tested here instead.

  Run directly, or via scripts/test.sh which runs it as part of the suite.
*/
import { fold, codeKey, matchesQuery, filterItems } from '../assets/js/search.js';

let failed = 0;
const eq = (actual, expected, label) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  \x1b[32mPASS\x1b[0m ${label}`);
  } else {
    console.log(`  \x1b[31mFAIL\x1b[0m ${label}\n       expected ${e}\n       got      ${a}`);
    failed = 1;
  }
};

const PRODUCT = 'Chai nhựa HDPE mẫu 01 HD-601 250ml HDPE 24/410';
const JAR = 'Hũ nhựa PET 1000ML HD-1000 1000ml PET 24/410';
const hit = (hay, q) => matchesQuery(hay, q);

console.log('==> fold');
eq(fold('Chai nhựa'), 'chai nhua', 'strips Vietnamese tone and vowel marks');
eq(fold('Hũ'), 'hu', 'strips a tilde vowel');
eq(fold('đóng đai'), 'dong dai', 'maps đ to d — NFD does not decompose it');
eq(fold('Đóng'), 'dong', 'maps uppercase Đ to d');
eq(fold('HD-601'), 'hd-601', 'lowercases without touching punctuation');
eq(fold('Cổ chai'), 'co chai', 'strips a hook-above mark');

console.log('==> codeKey');
eq(codeKey('HD-601'), 'hd601', 'drops the hyphen from a product code');
eq(codeKey('24/410'), '24410', 'drops the slash from a neck size');
eq(codeKey('Chai nhựa'), 'chainhua', 'folds accents and drops the space');

console.log('==> matchesQuery: product name');
eq(hit(PRODUCT, 'chai'), true, 'plain substring of the title');
eq(hit(PRODUCT, 'CHAI'), true, 'query case is ignored');
eq(hit(PRODUCT, 'nhựa'), true, 'accented query matches accented title');
eq(hit(PRODUCT, 'nhua'), true, 'unaccented query matches accented title');
eq(hit(JAR, 'hu nhua'), true, 'unaccented multi-word matches "Hũ nhựa"');
eq(hit(PRODUCT, 'xyz'), false, 'a non-matching query does not match');
// Word-prefix, not substring: "hu" lives inside "nhua", and matching it there
// made every Chai nhựa a result for Hũ nhựa.
eq(hit(PRODUCT, 'hu'), false, 'a term inside another word does not match');
eq(hit(JAR, 'hu'), true, 'the same term matches where it starts a word');
eq(hit(PRODUCT, 'pe'), false, 'a letter fragment inside HDPE does not match');
eq(hit(PRODUCT, 'hd'), true, 'a genuine word prefix does match');

console.log('==> matchesQuery: product code');
eq(hit(PRODUCT, 'HD-601'), true, 'exact code');
eq(hit(PRODUCT, 'hd-601'), true, 'lowercase code');
eq(hit(PRODUCT, 'hd601'), true, 'code without the hyphen');
eq(hit(PRODUCT, 'HD 601'), true, 'code typed with a space instead of a hyphen');
eq(hit(PRODUCT, '601'), true, 'partial code');
eq(hit(PRODUCT, 'HD-602'), false, 'a different code does not match');
eq(hit(JAR, 'HD-1000'), true, 'four-digit code');

console.log('==> matchesQuery: specs');
eq(hit(PRODUCT, '250ml'), true, 'capacity');
eq(hit(PRODUCT, 'HDPE'), true, 'material');
eq(hit(PRODUCT, '24/410'), true, 'neck size with slash');
eq(hit(PRODUCT, '24410'), true, 'neck size without slash');
eq(hit(PRODUCT, '500ml'), false, 'a capacity this product does not have');

console.log('==> matchesQuery: multiple tokens');
eq(hit(PRODUCT, 'chai 250ml'), true, 'all tokens present, across two fields');
eq(hit(PRODUCT, 'chai 500ml'), false, 'one token missing fails the whole query');
eq(hit(PRODUCT, '  chai   hdpe  '), true, 'extra whitespace is ignored');
eq(hit(PRODUCT, ''), true, 'an empty query matches everything');

console.log('==> filterItems');
const items = [
  { s: PRODUCT, h: '<article>a</article>' },
  { s: JAR, h: '<article>b</article>' },
];
eq(filterItems(items, ''), null, 'blank query returns null, meaning "not searching"');
eq(filterItems(items, '   '), null, 'whitespace-only query also returns null');
eq(filterItems(items, 'zzz'), [], 'no matches returns an empty array, not null');
eq(filterItems(items, 'HD-601').map((i) => i.h), ['<article>a</article>'], 'code narrows to one product');
eq(filterItems(items, 'nhua').length, 2, 'a shared term matches both products');
eq(filterItems(items, 'hu').length, 1, 'a term unique to the jar matches only it');

console.log(failed ? '\n\x1b[31mSEARCH TESTS FAILED\x1b[0m' : '\n\x1b[32mSEARCH TESTS PASS\x1b[0m');
process.exit(failed);
