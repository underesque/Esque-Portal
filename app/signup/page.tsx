import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Button, Input, Label } from "@/components/ui";
import { signupEmployee } from "@/lib/actions/auth";

export default async function SignupPage({
  searchParams,
}: PageProps<"/signup">) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <div className="flex flex-1 items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo boxed={false} className="h-12 w-auto" />
        </div>
        <div className="rounded-2xl bg-surface backdrop-blur-xl border border-surface-border p-8 shadow-[0_16px_48px_-12px_rgba(38,35,44,0.16)]">
          <h1 className="text-lg font-semibold text-foreground font-display">Create your account</h1>
          <p className="mt-1 text-sm text-muted">
            For ESQUE team members — use the email address already on file for you. You&apos;ll be
            able to see your own monthly performance scorecard once signed in.
          </p>

          {error && (
            <div className="mt-4 rounded-lg bg-red-50/80 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-600/20">
              {error}
            </div>
          )}

          <form action={signupEmployee} className="mt-6 space-y-4">
            <div>
              <Label>Email</Label>
              <Input type="email" name="email" required autoComplete="email" />
            </div>
            <div>
              <Label>Password</Label>
              <Input type="password" name="password" required minLength={6} autoComplete="new-password" />
            </div>
            <Button type="submit" className="w-full">
              Create account
            </Button>
          </form>

          <p className="mt-5 text-center text-xs text-muted">
            Already have an account?{" "}
            <Link href="/login" className="text-foreground underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
