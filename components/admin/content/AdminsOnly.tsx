import { Card } from "@/components/brand/Card";

/** Signed in, but without admin at any rooftop. */
export function AdminsOnly() {
  return (
    <main className="mx-auto max-w-app px-4 py-10">
      <Card className="p-6">
        <h1 className="text-lg font-extrabold text-navy">Admins only</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          The coaching library is managed by EDIAGD admins. If you should have
          access, ask your EDIAGD contact to add the admin role to your account.
        </p>
      </Card>
    </main>
  );
}

export default AdminsOnly;
