// ---------------------------------------------------------------------------
// Domain limits shared by validation, defaults and the UI.
//
// These are intentionally generous for a gym TV but small enough that a bad
// payload cannot create timers or ad intervals with pathological values.
// ---------------------------------------------------------------------------

/** Longest timer phase accepted (24 h). */
export const MAX_TIMER_SECONDS = 24 * 60 * 60;

/** Longest interval session in rounds. */
export const MAX_TIMER_ROUNDS = 999;

/** Longest dwell time for a carousel slide (10 min). */
export const MAX_SECONDS_PER_SLIDE = 600;

/** Longest dwell time for an ad (10 min). */
export const MAX_SECONDS_PER_AD = 600;

/** Screen/TV display name limit, matching the DO's create-screen check. */
export const MAX_SCREEN_NAME_LENGTH = 60;

/** Defensive cap on playlist length (ads or carousel items). */
export const MAX_PLAYLIST_ITEMS = 100;
