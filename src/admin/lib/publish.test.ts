import { describe, expect, it } from 'vitest';
import { createDefaultScreen, timerFromConfig } from '@/shared/defaults';
import type { EditableField } from './publish';
import { buildPreviewScreen, buildPublishCommands, editableFieldsOf } from './publish';
import type { Screen } from '@/shared/types/signage';

function screen(overrides: Partial<Screen> = {}): Screen {
  return { ...createDefaultScreen('wod', 'gym'), ...overrides };
}

function dirty(...fields: EditableField[]): Set<EditableField> {
  return new Set(fields);
}

describe('editableFieldsOf', () => {
  it('keeps only screen fields that map to a command', () => {
    expect(editableFieldsOf({ main: {}, name: 'x', id: 'wod', updatedAt: 1 })).toEqual([
      'main',
      'name',
    ]);
  });
});

describe('buildPublishCommands', () => {
  it('publishes only dirty fields', () => {
    const server = screen();
    const draft = { ...server, name: 'Nueva', brand: { ...server.brand, primaryColor: '#000000' } };

    expect(buildPublishCommands({ draft, server, dirty: dirty('name') })).toEqual([
      { type: 'SET_SCREEN_NAME', name: 'Nueva' },
    ]);
    expect(buildPublishCommands({ draft, server, dirty: dirty('brand') })).toEqual([
      { type: 'SET_BRAND', brand: draft.brand },
    ]);
  });

  it('publishes fields in a stable order', () => {
    const server = screen();
    const draft = { ...server, name: 'Nueva' };
    const commands = buildPublishCommands({
      draft,
      server,
      dirty: dirty('name', 'ads', 'brand', 'main'),
    });
    expect(commands.map((command) => command.type)).toEqual([
      'SET_MAIN',
      'SET_BRAND',
      'SET_ADS',
      'SET_SCREEN_NAME',
    ]);
  });

  it('does not publish an unchanged name', () => {
    const server = screen();
    expect(
      buildPublishCommands({ draft: server, server, dirty: dirty('name') }),
    ).toEqual([]);
  });

  it('publishes the name when no server screen is loaded', () => {
    const draft = screen({ name: 'Nueva' });
    expect(buildPublishCommands({ draft, server: null, dirty: dirty('name') })).toEqual([
      { type: 'SET_SCREEN_NAME', name: 'Nueva' },
    ]);
  });

  it('keeps the live server timer when the draft is a timer', () => {
    const serverTimer = timerFromConfig(
      { mode: 'countdown', workSeconds: 60, restSeconds: 0, rounds: 1 },
      1_000,
    );
    const server = screen({ main: { type: 'timer', timer: serverTimer } });
    const draft = screen({ main: { type: 'timer', timer: { ...serverTimer, status: 'idle' } } });

    const commands = buildPublishCommands({ draft, server, dirty: dirty('main') });
    expect(commands).toEqual([{ type: 'SET_MAIN', content: { type: 'timer', timer: serverTimer } }]);
  });

  it('uses the draft timer when the server is not a timer', () => {
    const draftTimer = timerFromConfig(
      { mode: 'amrap', workSeconds: 300, restSeconds: 0, rounds: 1 },
      1_000,
    );
    const draft = screen({ main: { type: 'timer', timer: draftTimer } });
    const commands = buildPublishCommands({ draft, server: screen(), dirty: dirty('main') });
    expect(commands).toEqual([{ type: 'SET_MAIN', content: { type: 'timer', timer: draftTimer } }]);
  });

  it('returns no commands for a clean draft', () => {
    const server = screen();
    expect(buildPublishCommands({ draft: server, server, dirty: dirty() })).toEqual([]);
  });
});

describe('buildPreviewScreen', () => {
  it('returns null without a draft', () => {
    expect(buildPreviewScreen(null, screen())).toBeNull();
  });

  it('uses the draft for non-timer content', () => {
    const draft = screen({ name: 'Borrador' });
    expect(buildPreviewScreen(draft, screen())).toBe(draft);
  });

  it('merges the live server timer into a timer draft', () => {
    const serverTimer = timerFromConfig(
      { mode: 'countdown', workSeconds: 60, restSeconds: 0, rounds: 1 },
      1_000,
    );
    const draftTimer = { ...serverTimer, status: 'idle' as const };
    const draft = screen({ name: 'Borrador', main: { type: 'timer', timer: draftTimer } });
    const server = screen({ main: { type: 'timer', timer: serverTimer } });

    const preview = buildPreviewScreen(draft, server);
    expect(preview?.name).toBe('Borrador');
    expect(preview?.main).toEqual({ type: 'timer', timer: serverTimer });
  });
});
