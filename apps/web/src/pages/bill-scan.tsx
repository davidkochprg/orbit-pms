import { Camera, CircleCheck, ImageUp, LoaderCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { useParams } from 'react-router';
import { ErrorNotice } from '@/components/error-notice';
import { Wordmark } from '@/components/wordmark';
import { Button } from '@/components/ui/button';
import { usePhoneBillScan, usePhoneBillUpload } from '@/lib/api';
import { BILL_PHOTO_MAX_EDGE, prepareIdPhoto } from '@/lib/photo';

/**
 * The phone side of a bill scan, opened from the QR code at the desk. It takes one photo and
 * sends it; what was read is shown only on the desk screen.
 */
export function BillScanPage() {
  const { id = '' } = useParams();
  const view = usePhoneBillScan(id);
  const upload = usePhoneBillUpload(id);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [unreadable, setUnreadable] = useState(false);
  const status = upload.data?.status ?? view.data?.status;
  const busy = preparing || upload.isPending || status === 'reading';

  async function send(input: HTMLInputElement) {
    const file = input.files?.[0];
    // Cleared, so picking the same photo again still counts as a change.
    input.value = '';
    if (!file) return;
    setPreparing(true);
    setUnreadable(false);
    try {
      upload.mutate(await prepareIdPhoto(file, BILL_PHOTO_MAX_EDGE));
    } catch {
      setUnreadable(true);
    } finally {
      setPreparing(false);
    }
  }
  const problem = unreadable
    ? "This phone couldn't open that photo. Take it again with the camera."
    : (upload.error?.message ?? upload.data?.error ?? view.data?.error ?? null);

  return (
    <main className="flex min-h-dvh flex-col bg-sidebar px-4 py-6 text-foreground">
      <header className="flex items-center gap-2 text-sm font-medium">
        <Wordmark size="sm" />
        <span className="text-muted-foreground">Bill scan</span>
      </header>

      <section className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 py-8">
        {view.isError ? (
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold tracking-tight">This link has expired</h1>
            <p className="text-muted-foreground">Open a new one at the desk.</p>
          </div>
        ) : !view.data ? (
          <LoaderCircle className="mx-auto size-6 animate-spin text-muted-foreground" />
        ) : status === 'done' ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <CircleCheck className="size-12 text-success" />
            <h1 className="text-xl font-semibold tracking-tight">Sent to the desk</h1>
            <p className="text-muted-foreground">You can close this page.</p>
          </div>
        ) : busy ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <LoaderCircle className="size-10 animate-spin text-primary-text" />
            <h1 className="text-xl font-semibold tracking-tight">Reading the bill…</h1>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Photograph the bill</h1>
              <p className="text-muted-foreground">The whole page, flat and without glare.</p>
            </div>
            {problem && <ErrorNotice message={problem} />}
            <div className="flex flex-col gap-2">
              <Button size="lg" className="h-14 text-base" onClick={() => camera.current?.click()}>
                <Camera className="size-5" /> Take a photo
              </Button>
              <Button variant="ghost" onClick={() => library.current?.click()}>
                <ImageUp /> Choose an existing photo
              </Button>
            </div>
          </>
        )}
      </section>

      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => void send(e.currentTarget)}
      />
      <input
        ref={library}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => void send(e.currentTarget)}
      />
    </main>
  );
}
