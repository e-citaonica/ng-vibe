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

export const eventTypeMap = {
  input: [
    'input.type',
    'input.type.compose',
    'input.paste',
    'input.drop',
    'input.complete',
  ] as const,
  delete: [
    'delete.selection',
    'delete.forward',
    'delete.backward',
    'delete.cut',
  ] as const,
  move: ['move.drop'] as const,
  select: ['select.pointer'] as const,
  undo: [] as const,
  redo: [] as const,
};

export type EventType = keyof typeof eventTypeMap;

export type EventSubtype<T extends EventType | 'any'> = T extends EventType
  ? (typeof eventTypeMap)[T][number]
  : (typeof eventSubtypes)[number];

export type EventDescriptor =
  | {
      origin: 'user';
      type: EventType;
      subtype?: EventSubtype<'any'>;
    }
  | { origin: 'dispatch'; type?: EventType; subtype?: EventSubtype<'any'> };
