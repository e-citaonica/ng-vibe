import {
  Decoration,
  DecorationSet,
  EditorView,
  Tooltip,
  ViewPlugin,
  WidgetType,
  showTooltip,
} from '@codemirror/view';
import { Selection } from './models';
import {
  Annotation,
  EditorState,
  RangeSet,
  StateEffect,
  StateField,
} from '@codemirror/state';
import { Observable } from 'rxjs';
import { arr } from './document/document.component';

const addUnderline = StateEffect.define<{ from: number; to: number }>({
  map: ({ from, to }, change) => ({
    from: change.mapPos(from),
    to: change.mapPos(to),
  }),
});

const underlineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(underlines, tr) {
    underlines = underlines.map(tr.changes);
    for (let e of tr.effects)
      if (e.is(addUnderline)) {
        underlines = underlines.update({
          add: [underlineMark.range(e.value.from, e.value.to)],
        });
      }
    return underlines;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const underlineMark = Decoration.mark({ class: 'cm-underline' });

const underlineTheme = EditorView.baseTheme({
  '.cm-underline': { textDecoration: 'underline 3px red' },
});

export function underlineSelection(view: EditorView) {
  let effects: StateEffect<unknown>[] = view.state.selection.ranges
    .filter((r) => !r.empty)
    .map(({ from, to }) => addUnderline.of({ from, to }));
  if (!effects.length) return false;

  if (!view.state.field(underlineField, false))
    effects.push(StateEffect.appendConfig.of([underlineField, underlineTheme]));
  view.dispatch({ effects });
  return true;
}

export const userSelectionsDisplay = (
  selection$: Observable<Selection>,
  userLeave$: Observable<string>
) => [
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      selections = new Map<string, Selection>();

      constructor(view: EditorView) {
        // Initialize decorations to empty array so CodeMirror doesn't crash.
        this.decorations = RangeSet.of([]);

        selection$.subscribe((selection) => {
          this.selections.set(selection.performedBy, selection);

          this.decorations = Decoration.set(
            [...this.selections.entries()].map(([username, selection]) => {
              return {
                from: selection.from,
                to: selection.to,
                value: Decoration.widget({
                  side: -1,
                  block: false,
                  widget: new UserSelectionWidget(selection.performedBy),
                }),
              };
            })
          );

          userLeave$.subscribe((socketId) => {
            // TODO: username or socketId?
            this.selections.delete(socketId);
          });

          // Somehow this triggers re-rendering of the Decorations.
          // Not sure if this is the correct usage of the API.
          // Inspired by https://github.com/yjs/y-codemirror.next/blob/main/src/y-remote-selections.js
          // Set timeout so that the current CodeMirror update finishes
          // before the next ones that render presence begin.
          setTimeout(() => {
            view.dispatch({ annotations: [userSelectionAnnotation.of(true)] });
          }, 0);
        });
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  ),
  userPresenceTheme,
];

const userSelectionAnnotation = Annotation.define();

class UserSelectionWidget extends WidgetType {
  constructor(readonly username: string) {
    super();
  }

  override eq(other: UserSelectionWidget): boolean {
    return other.username == this.username;
  }

  toDOM() {
    const span = document.createElement('span');
    span.setAttribute('aria-hidden', 'true');
    span.className = 'cm-tooltip-cursor';
    span.textContent = this.username;

    // span.appendChild(document.createElement('div'));
    return span;
  }

  override ignoreEvent() {
    return false;
  }
}

const userPresenceTheme = EditorView.baseTheme({
  'cm-tooltip-cursor': {
    backgroundColor: '#66b',
    color: 'white',
    border: 'none',
    padding: '2px 7px',
    borderRadius: '4px',
  },
});

export const cursorTooltipBaseTheme = EditorView.baseTheme({
  '.cm-tooltip.cm-tooltip-cursor': {
    backgroundColor: '#66b',
    color: 'white',
    border: 'none',
    padding: '2px 7px',
    borderRadius: '4px',
    '& .cm-tooltip-arrow:before': {
      borderTopColor: '#66b',
    },
    '& .cm-tooltip-arrow:after': {
      borderTopColor: 'transparent',
    },
  },
});
