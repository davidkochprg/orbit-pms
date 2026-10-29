import { ArrowRight, Inbox, type LucideIcon, Mic, Sparkles } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Wordmark } from '@/components/wordmark';
import { ErrorNotice } from '@/components/error-notice';
import { WelcomeScene } from '@/components/welcome-scene';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { useSession } from '@/hooks/use-session';
import { useDailyBrief, useDayOverview } from '@/lib/api';
import { sceneMessages } from '@/lib/scene-messages';
import { demoManager, staffRoleLabels } from '@/lib/session';

const features: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Sparkles,
    title: 'Ask for anything',
    text: 'The agent checks rooms, quotes prices and prepares changes for you to confirm.',
  },
  {
    icon: Inbox,
    title: 'Replies ready to send',
    text: 'Guest emails arrive with a reply drafted in their language, priced from your rates.',
  },
  {
    icon: Mic,
    title: 'Housekeeping by voice',
    text: 'A spoken note marks rooms clean and opens repair tasks.',
  },
];

/** The public landing page: one click signs a visitor into the demo as the manager. */
export function WelcomePage() {
  const session = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const brief = useDailyBrief();
  const day = useDayOverview();
  const manager = demoManager(session.staff);
  const next = params.get('next')?.startsWith('/') ? params.get('next')! : '/';
  const panel = useRef<HTMLElement>(null);

  function enter() {
    if (!manager) return;
    session.signInAs(manager.id);
    void navigate(next, { replace: true });
  }

  const b = brief.data;
  // What is happening at the demo hotel today, typed into the scene.
  const sceneData = useMemo(() => (b ? sceneMessages(b, day.data) : []), [b, day.data]);

  return (
    <div className="relative flex min-h-svh flex-col bg-scene-page lg:h-svh lg:flex-row lg:justify-end lg:overflow-hidden">
      {/* On wide screens the scene fills the page and the panel floats over it, inset. */}
      <section className="h-72 shrink-0 sm:h-96 lg:absolute lg:inset-0 lg:h-auto">
        <WelcomeScene data={sceneData} cover={panel} />
      </section>

      <main
        ref={panel}
        className="relative flex flex-1 flex-col bg-background lg:my-10 lg:mr-10 lg:w-[min(34rem,40vw)] lg:flex-none lg:rounded-2xl lg:shadow-floating"
      >
        <header className="flex items-center justify-end gap-3 p-5 text-xs text-muted-foreground">
          <span>Fictional hotel · synthetic data</span>
        </header>

        <div className="flex flex-1 items-center justify-center px-6 pb-16">
          <div className="flex w-full max-w-sm flex-col gap-8">
            <Wordmark size="lg" />

            <div className="flex flex-col gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-balance">
                Run your hotel by asking
              </h1>
              <p className="text-base text-muted-foreground text-pretty">
                A property management system for small hotels with an AI agent built in. Anything
                you can click, you can also ask for.
              </p>
            </div>

            <ul className="flex flex-col gap-4">
              {features.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-text">
                    <Icon className="size-4" />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{title}</span>
                    <span className="text-sm text-muted-foreground">{text}</span>
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-3">
              {session.staffError ? (
                <ErrorNotice message="The demo server is not reachable right now. Please try again in a moment." />
              ) : (
                <Button
                  size="lg"
                  className="h-11 w-full text-base"
                  disabled={!manager}
                  onClick={enter}
                >
                  Enter demo <ArrowRight />
                </Button>
              )}
              {session.current && session.current.id !== manager?.id && (
                <Button
                  variant="outline"
                  size="lg"
                  className="h-11 w-full"
                  onClick={() => void navigate(next, { replace: true })}
                >
                  Continue as {session.current.name}
                </Button>
              )}
              <p className="text-xs text-muted-foreground text-pretty">
                No sign-up.{' '}
                {manager
                  ? `You enter as ${manager.name}, ${staffRoleLabels[manager.role].toLowerCase()} of a fictional ${b?.occupancy.total ?? 50}-room guesthouse.`
                  : 'You enter as the manager of a fictional guesthouse.'}{' '}
                Press <Kbd>⌘K</Kbd> inside to talk to the agent.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
