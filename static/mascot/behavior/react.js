// Does an answer read as "book found" or "book not found"?
//
// PORTED VERBATIM from the old static/ram.js (lines 526-537). Kept in behavior/ rather than in
// the core because it is domain knowledge about this particular chatflow's answer format, not
// something a mascot should know -- the desktop pet build never imports it.
//
// The counting comparison matters and is not incidental: an answer commonly lists several
// books, some available and some not. Requiring found >= notFound means a list that is mostly
// misses doesn't trigger a celebration.
export function detectOutcome(text) {
  if (!text) return null;
  const foundCount = (text.match(/Availability:\s*Available/gi) || []).length;
  const notFoundCount = (text.match(/Availability:\s*Not available/gi) || []).length;
  if (foundCount > 0 && foundCount >= notFoundCount) return 'found';
  if (notFoundCount > 0) return 'not_found';
  if (/unfortunately|none of the (found )?books/i.test(text)) return 'not_found';
  if (/great news|available in (our|the) (school )?library catalog/i.test(text)) return 'found';
  return null;
}
