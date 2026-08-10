// lib/pdf-labels.ts — pure PDF label helpers (2026-08-10).
// Lives OUTSIDE lib/pdf.tsx so smoke tests can import it without dragging in
// @react-pdf/renderer (the tests tsconfig only compiles ../lib/**/*.ts).

/** "1/7" style page index — pageNumber/totalPages for the PDF footer. */
export function pageNumberLabel(pageNumber: number, totalPages: number): string {
  return `${pageNumber}/${totalPages}`;
}
