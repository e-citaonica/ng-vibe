import {
  EditorView,
  Tooltip,
  hoverTooltip,
  showTooltip,
} from '@codemirror/view';
import { hashStringToColor } from '../../core/util/helpers';
import { TextSelection } from '../../model/models';
import { StateField } from '@codemirror/state';
import { Signal } from '@angular/core';

export const selectionHover = (
  selections: Signal<Map<string, TextSelection>>
) =>
  hoverTooltip((view, pos, side) => {
    const selectionsInRange = [...selections().values()].filter(
      (s) => s.from <= pos && s.to >= pos
    );

    return {
      pos: pos,
      above: true,
      create(view) {
        let dom = document.createElement('div');
        dom.textContent = selectionsInRange
          .map((s) => s.performedBy)
          .join(', ');
        return { dom };
      },
    };
  });

export const selectionTooltipField = (
  selections: Signal<Map<string, TextSelection>>
) =>
  StateField.define<readonly Tooltip[]>({
    // @ts-ignore
    create: (state) => () => getSelectionTooltips(selections),

    update: (tooltips, tr) => getSelectionTooltips(selections),

    provide: (f) => showTooltip.computeN([f], (state) => state.field(f)),
  });

const getSelectionTooltips = (
  selections: Signal<Map<string, TextSelection>>
): readonly Tooltip[] => {
  return [...selections().entries()].map(([username, selection]) => {
    return {
      pos: selection.to,
      above: true,
      strictSide: true,
      arrow: true,
      create: () => {
        const dom = document.createElement('div');
        dom.className = 'cm-tooltip-selection';
        dom.id = username;
        dom.style.backgroundColor = hashStringToColor(username);
        dom.style.color = 'black';

        // setTimeout(() => {
        //   (
        //     document.querySelector(
        //       `#${username} .cm-tooltip-arrow:before`
        //     ) as any
        //   ).style.setProperty(
        //     'border-top',
        //     `7px solid ${hashStringToColor(username)}`
        //   );
        // }, 0);

        dom.textContent = username;
        return { dom };
      },
    };
  });
};

export const selectionTooltipBaseTheme = EditorView.baseTheme({
  '.cm-tooltip.cm-tooltip-selection': {
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
