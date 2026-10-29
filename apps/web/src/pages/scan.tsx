import { Camera, CircleCheck, ImageUp, LoaderCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { useParams } from 'react-router';
import { Wordmark } from '@/components/wordmark';
import { ErrorNotice } from '@/components/error-notice';
import { Button } from '@/components/ui/button';
import { usePhoneScan, usePhoneUpload } from '@/lib/api';
import { prepareIdPhoto } from '@/lib/photo';

/**
 * The phone side of an ID scan, opened from the QR code at the desk. It takes one photo and
 * sends it; what was read is shown only on the desk screen, never here.
 */
export function ScanPage() {
  const { id = '' } = useParams();
  const view = usePhoneScan(id);
  const upload = usePhoneUpload(id);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [unreadable, setUnreadable] = useState(false);
  const busy = preparing || upload.isPending || view.data?.status === 'reading';
  const status = upload.data?.status ?? view.data?.status;

  async function send(input: HTMLInputElement) {
    const file = input.files?.[0];
    // Cleared, so picking the same photo again still counts as a change.
    input.value = '';
    if (!file) return;
    setPreparing(true);
    setUnreadable(false);
    try {
      upload.mutate(await prepareIdPhoto(file));
    } catch {
      setUnreadable(true);
    } finally {
      setPreparing(false);
    }
  }
  const problem = unreadable
    ? "This phone couldn't open that photo. Take it again with the camera."
    : (upload.error?.message ?? view.data?.error ?? null);

  const who = view.data?.firstName ? `${view.data.firstName}'s` : 'the guest’s';

  return (
    <main className="flex min-h-dvh flex-col bg-sidebar px-4 py-6 text-foreground">
      <header className="flex items-baseline gap-2 text-sm font-medium">
        <Wordmark size="sm" />
        <span className="text-muted-foreground">ID scan</span>
      </header>

      <section className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 py-8">
        {view.isError ? (
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold tracking-tight">This link has expired</h1>
            <p className="text-muted-foreground">
              Scan links work for 15 minutes. Ask at the desk for a new code.
            </p>
          </div>
        ) : !view.data ? (
          <LoaderCircle className="mx-auto size-6 animate-spin text-muted-foreground" />
        ) : status === 'done' ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <CircleCheck className="size-12 text-success" />
            <h1 className="text-xl font-semibold tracking-tight">Sent to the desk</h1>
            <p className="text-muted-foreground">
              The details are checked on the reception screen. The photo isn&apos;t kept. You can
              close this page.
            </p>
            {unreadable && problem && <ErrorNotice message={problem} />}
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => camera.current?.click()}
            >
              Retake the photo
            </Button>
          </div>
        ) : busy ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <LoaderCircle className="size-10 animate-spin text-primary-text" />
            <h1 className="text-xl font-semibold tracking-tight">Reading the document…</h1>
            <p className="text-muted-foreground">This takes a few seconds.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Photograph {who} ID</h1>
              <p className="text-muted-foreground">
                Room {view.data.roomName}. Lay the ID card or passport photo page flat, fill the
                frame and avoid glare.
              </p>
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
      <footer className="text-center text-xs text-subtle-foreground">
        The photo is read once to fill in the guest book and then discarded.
      </footer>
    </main>
  );
}
