import { hoverTooltip } from '@codemirror/view';
import { TextSelection } from '../../model/models';
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
      }
    };
  });
