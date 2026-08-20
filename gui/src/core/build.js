// The version of the code the *page* is running, shown in the settings panel's
// Système section.
//
// It exists because "I don't see the change" has no answer you can check.
// A stale page is indistinguishable from a wrong one by looking at it, and the
// difference decides everything: one needs a reload, the other needs a fix.
// This turns that into a reading. If the panel shows an older build than the
// one on disk, the page is stale and nothing in the code is at fault.
//
// Deliberately not read from sw.js's CACHE_VERSION, though the two are bumped
// together: that constant describes the offline copy the worker holds, and
// this describes the modules the page has actually loaded. When they disagree
// — a fresh worker beside a stale page — that disagreement is the very thing
// worth seeing, and a single shared value would hide it.
export const BUILD = 'v56'
