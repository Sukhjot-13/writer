# Suggestions

## 🔴 Vulnerabilities

- **2026-08-13 — react-pdf 4.6.0 (latest) `fixed` + `position: absolute` + `bottom` footer bug.** On continuation pages of multi-page documents, the paginator omits the page box height when splitting (`omit('height', page.box)` in `@react-pdf/layout` `splitPage`), which breaks yoga's bottom resolution and gives the footer a garbage ~1e22pt height → pdfkit rejects the coordinate ("unsupported number: -1.2915355457378698e+22") → the whole PDF download 500s. Only documents long enough to paginate were affected. **Workaround in place** (`lib/pdf.tsx`): pin `height` to one footer line on the footer View. If we ever upgrade react-pdf, re-test a 60+ block document immediately — and consider removing the pinned height if the upstream layout is fixed.

## 🟢 Improvements

- **2026-08-13 — PDF QA cards never split mid-question (done).** react-pdf v4.6 has no `breakInside: "avoid"` style; the equivalent is the `wrap={false}` View prop (moves the whole element to the next page instead of splitting it; oversized elements stay put and push future siblings over — `splitNodes` in `@react-pdf/layout`). Applied to each QA card in `lib/pdf.tsx`, mirroring `.qa-block { break-inside: avoid }` in the HTML template. Verified: 84/84 qa blocks un-split (page count 17→18 as cards moved whole). If react-pdf ever adds `breakInside`, consider switching for readability.

- **2026-08-13 — PDF badge digit centering is empirical, not modeled.** The download's badge digit sat ~3pt high; the first fix (`lineHeight: "18pt"`, CSS-style line-height trick) made it worse (~5.25pt high) because react-pdf anchors the glyph baseline differently than browsers. Current fix: unitless `lineHeight: 1.3` (~7.85pt line box, flex-centering pushes the digit to the 9pt center). If a future font change (tokens.fonts.pdf) shifts the baseline, re-measure with a 96dpi pixel check rather than reasoning from font metrics — the font-metric model did not predict the measured offsets.
