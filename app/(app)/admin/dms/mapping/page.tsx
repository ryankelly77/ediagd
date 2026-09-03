import { redirect } from "next/navigation";

/**
 * The sub-category queue moved.
 *
 * It is now Section 1 of /admin/mapping/dealer-codes, beside the dealer's op
 * codes, the volume behind each row and Mitch's proposals. Absorbed rather than
 * duplicated: that screen calls the same four server actions this one did, so
 * there is still exactly one write path and now exactly one surface.
 *
 * A redirect rather than a deletion because DMS Upload links here, Mitch has
 * the URL, and a 404 is a worse answer than the new address.
 */
export default async function LegacyMappingQueue() {
  redirect("/admin/mapping/dealer-codes");
}
