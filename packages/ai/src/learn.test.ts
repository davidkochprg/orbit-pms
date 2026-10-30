import { describe, expect, it } from 'vitest';
import { learnPrompt } from './prompts/learn';
import { type LearnedFact, toDraft } from './learn';

const today = '2026-05-10';
const fact: LearnedFact = {
  save: true,
  category: 'getting_here',
  title: ' EV charging ',
  details: 'Two chargers in the back lot, free for guests. ',
  tags: ['EV', '#parking', 'ev'],
  until: null,
};

describe('toDraft', () => {
  it('keeps a fact the reply states, trimmed', () => {
    expect(toDraft(fact, today)).toEqual({
      category: 'getting_here',
      title: 'EV charging',
      details: 'Two chargers in the back lot, free for guests.',
      tags: ['ev', 'parking'],
      until: null,
    });
  });

  it('saves nothing when the model found nothing new', () => {
    expect(toDraft({ ...fact, save: false }, today)).toBeNull();
  });

  it('saves nothing without a title or details, or when they are too long for an entry', () => {
    expect(toDraft({ ...fact, title: ' ' }, today)).toBeNull();
    expect(toDraft({ ...fact, details: 'x'.repeat(1001) }, today)).toBeNull();
  });

  it('drops an end date in the past rather than the fact', () => {
    expect(toDraft({ ...fact, until: '2026-05-01' }, today)?.until).toBeNull();
    expect(toDraft({ ...fact, until: '2026-05-12' }, today)?.until).toBe('2026-05-12');
  });
});

describe('learnPrompt', () => {
  it('gives the model what the hotel already knows, the question and the reply', () => {
    const prompt = learnPrompt({
      guestMessage: 'Can I charge my car?',
      reply: 'Yes, two chargers in the back lot.',
      entries: [
        {
          id: 'parking',
          category: 'getting_here',
          title: 'Parking',
          details: 'Free, behind the house.',
          tags: ['parking'],
        },
      ],
      today,
    });
    expect(prompt).toContain('Today is 2026-05-10.');
    expect(prompt).toContain('- Parking (getting_here; #parking): Free, behind the house.');
    expect(prompt).toContain('Can I charge my car?');
    expect(prompt).toContain('Yes, two chargers in the back lot.');
  });
});
