import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType
} from '@codemirror/view';
import { Annotation, RangeSet } from '@codemirror/state';
import { TextSelection } from '../../model/models';
import { Injector, Signal, effect } from '@angular/core';
import { hashStringToColor } from '../../core/util/helpers';

const highlight = (username: string) =>
  Decoration.mark({
    attributes: { style: `background-color: ${hashStringToColor(username)}` }
  });

export const usersCursorsExtension = (
  injector: Injector,
  selections: Signal<Map<string, TextSelection>>
) => [
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        // Initialize decorations to empty array so CodeMirror doesn't crash.
        this.decorations = RangeSet.of([]);

        effect(
          () => {
            // Side effect on selection changes.

            // Update decorations to reflect new presence state.
            // TODO: Consider mutating this rather than recomputing it on each change.

            const selectionValues = [...selections().values()];

            const cursorDecorations = selectionValues
              .filter((selection) => selection.from === selection.to)
              .map((selection) => {
                return {
                  from: selection.from,
                  to: selection.to,
                  value: Decoration.widget({
                    side: -1,
                    block: false,
                    widget: new CursorWidget(selection.performedBy)
                  })
                };
              });

            const selectionHighlightDecorations = selectionValues.map(
              (selection) => {
                return {
                  from: selection.from,
                  to: selection.to,
                  value: highlight(selection.performedBy)
                };
              }
            );

            this.decorations = Decoration.set(
              [...cursorDecorations, ...selectionHighlightDecorations],
              // Without this argument, we get the following error:
              // Uncaught Error: Ranges must be added sorted by `from` position and `startSide`
              true
            );

            // Somehow this triggers re-rendering of the Decorations.
            // Not sure if this is the correct usage of the API.
            // Inspired by https://github.com/yjs/y-codemirror.next/blob/main/src/y-remote-selections.js
            // Set timeout so that the current CodeMirror update finishes
            // before the next ones that render presence begin.
            setTimeout(() => {
              view.dispatch({ annotations: [presenceAnnotation.of(true)] });
            }, 0);
          },
          { injector: injector }
        );
      }
    },
    {
      decorations: (v) => v.decorations
    }
  ),
  cursorTheme
];

const presenceAnnotation = Annotation.define();

class CursorWidget extends WidgetType {
  constructor(readonly username: string) {
    super();
  }

  override eq(other: CursorWidget): boolean {
    return other.username == this.username;
  }

  toDOM() {
    const span = document.createElement('span');
    // span.setAttribute('aria-hidden', 'true');
    span.className = 'vibe-cursor';
    span.style.borderLeft = `3px solid ${hashStringToColor(this.username)}`;
    // span.textContent = this.username;

    span.appendChild(document.createElement('div'));
    return span;
  }

  override ignoreEvent() {
    return false;
  }
}

const cursorTheme = EditorView.baseTheme({
  'cm-tooltip-hover': {
    'user-select': 'none'
  },

  '.vibe-cursor': {
    position: 'relative'
  },
  '.vibe-cursor > div': {
    position: 'absolute',
    top: '0',
    bottom: '0',
    left: '0',
    right: '0'
    // borderLeft: '3px solid #66b',
    //borderRight: '1px solid black',
  }
});
