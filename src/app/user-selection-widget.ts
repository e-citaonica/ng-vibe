import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
} from '@codemirror/view';
import { Annotation, RangeSet, StateEffect } from '@codemirror/state';
import { Observable } from 'rxjs';
import { Selection } from './models';

const addHighlight = StateEffect.define<{ from: number; to: number }>({});
const removeHighlight = StateEffect.define<{ from: number; to: number }>({});

function h(str: string): number {
  return [...str].reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);
}

function backgroundColorHash(str: string) {
  const stringUniqueHash = h(str);

  const color = `hsl(${Math.abs(stringUniqueHash % 360)}, 85%, 85%)`;

  console.log(color);

  return color;
}

const highlight = (username: string) =>
  Decoration.mark({
    attributes: { style: `background-color: ${backgroundColorHash(username)}` },
  });

// const highlightedRanges = StateField.define({
//   create() {
//     return Decoration.none;
//   },
//   update(ranges, tr) {
//     ranges = ranges.map(tr.changes);
//     for (let e of tr.effects) {
//       if (e.is(addHighlight)) ranges = addRange(ranges, e.value);
//       else if (e.is(removeHighlight)) ranges = cutRange(ranges, e.value);
//     }
//     return ranges;
//   },
//   provide: (field) => EditorView.decorations.from(field),
// });

// function cutRange(ranges: DecorationSet, r: { from: number; to: number }) {
//   let leftover: Range<Decoration>[] = [];
//   ranges.between(r.from, r.to, (from, to, deco) => {
//     if (from < r.from) leftover.push(deco.range(from, r.from));
//     if (to > r.to) leftover.push(deco.range(r.to, to));
//   });
//   return ranges.update({
//     filterFrom: r.from,
//     filterTo: r.to,
//     filter: () => false,
//     add: leftover,
//   });
// }

// function addRange(ranges: DecorationSet, r: { from: number; to: number }) {
//   ranges.between(r.from, r.to, (from, to) => {
//     if (from < r.from) r = { from, to: r.to };
//     if (to > r.to) r = { from: r.from, to };
//   });
//   return ranges.update({
//     filterFrom: r.from,
//     filterTo: r.to,
//     filter: () => false,
//     add: [highlight.range(r.from, r.to)],
//   });
// }

// const invertHighlight = invertedEffects.of((tr) => {
//   let found = [];
//   for (let e of tr.effects) {
//     if (e.is(addHighlight)) found.push(removeHighlight.of(e.value));
//     else if (e.is(removeHighlight)) found.push(addHighlight.of(e.value));
//   }
//   let ranges = tr.startState.field(highlightedRanges);
//   tr.changes.iterChangedRanges((chFrom, chTo) => {
//     ranges.between(chFrom, chTo, (rFrom, rTo) => {
//       if (rFrom >= chFrom || rTo <= chTo) {
//         let from = Math.max(chFrom, rFrom),
//           to = Math.min(chTo, rTo);
//         if (from < to) found.push(addHighlight.of({ from, to }));
//       }
//     });
//   });
//   return found;
// });

function highlightSelections(view: EditorView, selections: Selection[]) {
  view.dispatch({
    effects: selections
      .filter((s) => s.from < s.to)
      .map((s) => addHighlight.of(s)),
  });
  return true;
}

function unhighlightSelections(view: EditorView, selections: Selection[]) {
  let effects: StateEffect<{ from: number; to: number }>[] = [];
  selections.forEach((selection) => {
    effects.push(
      removeHighlight.of({ from: selection.from, to: selection.to })
    );
  });

  // let highlighted = view.state.field(highlightedRanges);
  // for (let sel of view.state.selection.ranges) {
  //   highlighted.between(sel.from, sel.to, (rFrom, rTo) => {
  //     let from = Math.max(sel.from, rFrom),
  //       to = Math.min(sel.to, rTo);
  //     if (from < to) effects.push(removeHighlight.of({ from, to }));
  //   });
  // }

  view.dispatch({ effects });
  return true;
}

export const json1PresenceDisplay = (
  selection$: Observable<Selection>,
  userLeave$: Observable<string>
) => [
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        // Initialize decorations to empty array so CodeMirror doesn't crash.
        this.decorations = RangeSet.of([]);

        // Mutable state local to this closure representing aggregated presence.
        //  * Keys are presence ids
        //  * Values are presence objects as defined by ot-json1-presence
        const selections = new Map<string, Selection>();

        // Receive remote presence changes.
        selection$.subscribe((selection) => {
          // unhighlightSelections(view, [...selections.values()]);

          selections.set(selection.performedBy, selection);

          // Update decorations to reflect new presence state.
          // TODO consider mutating this rather than recomputing it on each change.

          const cursorDecorationsArr = [...selections.values()]
            .filter((selection) => selection.from === selection.to)
            .map((selection) => {
              return {
                from: selection.from,
                to: selection.to,
                value: Decoration.widget({
                  side: -1,
                  block: false,
                  widget: new UserSelectionWidget(selection.performedBy),
                }),
              };
            });

          const decorations2 = [...selections.values()].map((selection) => {
            return {
              from: selection.from,
              to: selection.to,
              value: highlight(selection.performedBy),
            };
          });

          this.decorations = Decoration.set(
            [...cursorDecorationsArr, ...decorations2],
            // Without this argument, we get the following error:
            // Uncaught Error: Ranges must be added sorted by `from` position and `startSide`
            true
          );

          // highlightSelections(view, [...selections.values()]);

          // Somehow this triggers re-rendering of the Decorations.
          // Not sure if this is the correct usage of the API.
          // Inspired by https://github.com/yjs/y-codemirror.next/blob/main/src/y-remote-selections.js
          // Set timeout so that the current CodeMirror update finishes
          // before the next ones that render presence begin.
          setTimeout(() => {
            view.dispatch({ annotations: [presenceAnnotation.of(true)] });
          }, 0);
        });

        userLeave$.subscribe((socketId) => selections.delete(socketId));
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  ),
  userPresenceTheme,
];

const presenceAnnotation = Annotation.define();

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
    span.className = 'cm-json1-presence';
    // span.textContent = this.username;

    span.appendChild(document.createElement('div'));
    return span;
  }

  override ignoreEvent() {
    return false;
  }
}

export const cursorTooltipBaseTheme = EditorView.baseTheme({
  '.cm-tooltip.cm-tooltip-cursor': {
    backgroundColor: '#66b',
    color: 'white',
    border: 'none',
    padding: '2px 7px',
    borderRadius: '4px',
    'margin-right': '5px',
    '& .cm-tooltip-arrow:before': {
      borderTopColor: '#66b',
    },
    '& .cm-tooltip-arrow:after': {
      borderTopColor: 'transparent',
    },
  },
});

const userPresenceTheme = EditorView.baseTheme({
  '.cm-json1-presence': {
    position: 'relative',
  },
  '.cm-json1-presence > div': {
    position: 'absolute',
    top: '0',
    bottom: '0',
    left: '0',
    right: '0',
    borderLeft: '3px solid #66b',
    //borderRight: '1px solid black',
  },
});
