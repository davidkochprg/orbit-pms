import type { Attachment } from '@orbit/shared';
import { Download, FileText, Image, Paperclip, X } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useUploadAttachment } from '@/lib/api';
import { attachmentHref, formatBytes } from '@/lib/mail';
import { cn } from '@/lib/utils';

/** Files on a message or a draft, each opening or downloading; removable while writing. */
export function AttachmentList({
  files,
  onRemove,
  className,
}: {
  files: Attachment[];
  onRemove?: (file: Attachment) => void;
  className?: string;
}) {
  if (files.length === 0) return null;
  return (
    <ul aria-label="Attachments" className={cn('flex flex-wrap gap-1.5', className)}>
      {files.map((f) => {
        const Icon = f.contentType.startsWith('image/') ? Image : FileText;
        return (
          <li
            key={f.id}
            className="flex h-9 max-w-72 items-center gap-2 rounded-lg border border-ink/8 bg-background pr-1 pl-2.5 text-sm"
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <a
              href={attachmentHref(f.id)}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 truncate hover:underline"
            >
              {f.name}
            </a>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {formatBytes(f.size)}
            </span>
            {onRemove ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${f.name}`}
                onClick={() => onRemove(f)}
              >
                <X />
              </Button>
            ) : (
              <Button variant="ghost" size="icon-xs" asChild>
                <a href={`${attachmentHref(f.id)}?download`} aria-label={`Download ${f.name}`}>
                  <Download />
                </a>
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** A button that uploads the files picked, one by one, and hands each back once kept. */
export function AttachButton({
  onAttached,
  disabled,
}: {
  onAttached: (file: Attachment) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadAttachment();
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          for (const file of Array.from(e.target.files ?? [])) {
            upload.mutate(file, { onSuccess: onAttached });
          }
          e.target.value = '';
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled || upload.isPending}
        onClick={() => input.current?.click()}
        tooltip={upload.error?.message}
        className={cn(upload.error && 'text-destructive')}
      >
        <Paperclip /> {upload.isPending ? 'Attaching…' : 'Attach'}
      </Button>
    </>
  );
}
