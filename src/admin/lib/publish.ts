// ---------------------------------------------------------------------------
// Pure helpers for the admin screen editor.
//
// The editor keeps a local draft and publishes only the fields the user
// touched. Extracting the rules here keeps the page component small and makes
// the "never clobber a live timer" behaviour testable.
// ---------------------------------------------------------------------------

import type { AdminCommand, MainContent, Screen } from '@/shared/types/signage';

/** Editable screen fields that map 1:1 to an admin command. */
export type EditableField = 'main' | 'brand' | 'ads' | 'name';

export function isEditableField(field: string): field is EditableField {
  return field === 'main' || field === 'brand' || field === 'ads' || field === 'name';
}

/** Fields present in a draft patch, in `Object.keys` order. */
export function editableFieldsOf(partial: object): EditableField[] {
  return Object.keys(partial).filter(isEditableField);
}

/**
 * Builds the commands for a publish, in a stable order.
 *
 * Only dirty fields are published, so an unrelated edit never overwrites a
 * timer (or other main content) that changed meanwhile.
 */
export function buildPublishCommands({
  draft,
  server,
  dirty,
}: {
  draft: Screen;
  server: Screen | null;
  dirty: ReadonlySet<EditableField>;
}): AdminCommand[] {
  const commands: AdminCommand[] = [];

  if (dirty.has('main')) {
    // A running timer owns its own live state on the server; the draft only
    // carries a placeholder, so keep the server timer (same as the preview).
    const content: MainContent =
      draft.main.type === 'timer' && server?.main.type === 'timer'
        ? { type: 'timer', timer: server.main.timer }
        : draft.main;
    commands.push({ type: 'SET_MAIN', content });
  }
  if (dirty.has('brand')) commands.push({ type: 'SET_BRAND', brand: draft.brand });
  if (dirty.has('ads')) commands.push({ type: 'SET_ADS', ads: draft.ads });
  if (dirty.has('name') && (!server || draft.name !== server.name)) {
    commands.push({ type: 'SET_SCREEN_NAME', name: draft.name });
  }

  return commands;
}

/**
 * Screen shown in the preview: draft edits plus the live server timer when the
 * draft is also a timer (so the preview keeps ticking).
 */
export function buildPreviewScreen(draft: Screen | null, server: Screen | null): Screen | null {
  if (!draft) return null;
  if (draft.main.type === 'timer' && server?.main.type === 'timer') {
    return { ...draft, main: { type: 'timer', timer: server.main.timer } };
  }
  return draft;
}
