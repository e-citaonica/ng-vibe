import { EditorView, Tooltip, showTooltip } from '@codemirror/view';
import { hashStringToColor } from '../../core/util/helpers';
import { TextSelection } from '../../model/models';
import { StateField } from '@codemirror/state';
import { Signal } from '@angular/core';

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
        dom.className = 'cm-tooltip-cursor';
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
  '.cm-tooltip.cm-tooltip-cursor': {
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
