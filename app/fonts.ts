/* Typography note — the brand book uses system-available faces:
 *   Wordmark + headings : Times-family serif  -> mapped to a serif stack in brand.css (--font-display)
 *   Body + UI + eyebrows: Helvetica            -> --font-body
 *   "Mahalo" accent     : Apple-Chancery       -> --font-script (chancery/script fallback)
 *
 * None require next/font since they resolve to system stacks. If you want a
 * guaranteed cross-platform match, load web equivalents here, e.g.:
 *
 *   import { Playfair_Display } from "next/font/google";     // serif display option
 *   export const display = Playfair_Display({ subsets:["latin"], variable:"--font-display-web" });
 *
 *   import { Pinyon_Script } from "next/font/google";        // Apple-Chancery stand-in
 *   export const script = Pinyon_Script({ weight:"400", subsets:["latin"], variable:"--font-script-web" });
 *
 * Then point --font-display / --font-script at the *-web variables in brand.css.
 */
export {};
