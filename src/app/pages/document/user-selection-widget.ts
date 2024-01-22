import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
} from '@codemirror/view';
import { Annotation, RangeSet } from '@codemirror/state';
import { Observable } from 'rxjs';
import { TextSelection } from '../../model/models';
import { Injector, Signal, effect } from '@angular/core';

const h = (str: string): number => {
  return [...str].reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);
};

export const hashStringToColor = (str: string) => {
  const stringUniqueHash = h(str);

  const color = `hsl(${Math.abs(stringUniqueHash % 360)}, 85%, 85%)`;

  return color;
};

const highlight = (username: string) =>
  Decoration.mark({
    attributes: { style: `background-color: ${hashStringToColor(username)}` },
  });

export const userPresenceExtension = (
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
            // TODO: consider mutating this rather than recomputing it on each change.

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
                    widget: new UserSelectionWidget(selection.performedBy),
                  }),
                };
              });

            const selectionHighlightDecorations = selectionValues.map(
              (selection) => {
                return {
                  from: selection.from,
                  to: selection.to,
                  value: highlight(selection.performedBy),
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
      decorations: (v) => v.decorations,
    }
  ),
  userCursorTheme,
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
    span.className = 'cm-user-cursor';
    span.style.borderLeft = `3px solid ${hashStringToColor(this.username)}`;
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
    // backgroundColor: '#66b',
    color: 'white',
    border: 'none',
    padding: '2px 7px',
    borderRadius: '4px',
    'margin-right': '5px',
    '& .cm-tooltip-arrow:before': {
      // borderTopColor: '#66b',
    },
    '& .cm-tooltip-arrow:after': {
      borderTopColor: 'transparent',
    },
  },
});

const userCursorTheme = EditorView.baseTheme({
  '.cm-user-cursor': {
    position: 'relative',
  },
  '.cm-user-cursor > div': {
    position: 'absolute',
    top: '0',
    bottom: '0',
    left: '0',
    right: '0',
    // borderLeft: '3px solid #66b',
    //borderRight: '1px solid black',
  },
});
