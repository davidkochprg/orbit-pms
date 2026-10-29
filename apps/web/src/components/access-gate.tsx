import { ArrowRight } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Outlet } from 'react-router';
import { BrandMark } from '@/components/brand-mark';
import { ErrorNotice } from '@/components/error-notice';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAccess, useEnterAccessCode } from '@/lib/api';

/**
 * Asks for the demo access code before anything else loads, when the deployment has one. If the
 * check itself fails, the page underneath shows its own "server not reachable" state.
 */
export function AccessGate() {
  const access = useAccess();
  if (access.isPending) return <div className="min-h-svh bg-background" />;
  if (access.data?.required && !access.data.granted) return <AccessPage />;
  return <Outlet />;
}

function AccessPage() {
  const enter = useEnterAccessCode();
  const [code, setCode] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (code.trim()) enter.mutate(code.trim());
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-6 py-16">
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex items-center gap-2.5">
          <BrandMark size="lg" />
          <span className="text-lg font-semibold tracking-tight">Orbit</span>
        </div>

        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            This demo is private for now
          </h1>
          <p className="text-base text-muted-foreground text-pretty">
            Enter the access code you were given to open the demo hotel.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <FormField label="Access code" htmlFor="access-code">
            <Input
              id="access-code"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-invalid={enter.isError || undefined}
            />
          </FormField>
          {enter.error && <ErrorNotice message={enter.error.message} />}
          <Button
            type="submit"
            size="lg"
            className="h-11 w-full text-base"
            disabled={!code.trim() || enter.isPending}
          >
            Continue <ArrowRight />
          </Button>
        </div>
      </form>
    </div>
  );
}
