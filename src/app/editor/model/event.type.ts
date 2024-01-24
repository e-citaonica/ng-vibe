export const eventSubtypes = [
  'input.type',
  'input.type.compose',
  'input.paste',
  'input.drop',
  'input.complete',
  'delete.selection',
  'delete.forward',
  'delete.backward',
  'delete.cut',
  'move.drop',
  'select.pointer',
] as const;

export const eventTypes = [
  'input',
  'delete',
  'move',
  'select',
  'undo',
  'redo',
] as const;

export type EventType = (typeof eventTypes)[number];

export type EventSubtype = (typeof eventSubtypes)[number];
