// app/library/page.tsx — legacy library route (M6 redesign).
// The dashboard at "/" lists documents, so /library just redirects home.

import { redirect } from "next/navigation";

export default function LibraryPage() {
  redirect("/");
}
