import { TextSelection, TextOperation } from './model/models';

export const transformSelection = (
  op1: TextSelection,
  op2: TextOperation
): TextSelection => {
  return op2.type === 'insert' ? transformSI(op1, op2) : transformSD(op1, op2);
};

const transformSI = (
  selection: TextSelection,
  op: TextOperation
): TextSelection => {
  // text inserted before selection
  if (op.position < selection.from) {
    console.log('text inserted before selection');
    const { from, to } = selection;
    const { length } = op;
    console.log({ from, to, length });
    return {
      docId: selection.docId,
      revision: selection.revision,
      from: selection.from + op.length,
      to: selection.to + op.length,
      performedBy: selection.performedBy,
    };
  } // text inserted inside selection => extend right anchor of selection by text length
  else if (op.position >= selection.from && op.position < selection.to) {
    console.log('text inserted inside selection');
    return {
      docId: selection.docId,
      revision: selection.revision,
      from: selection.from,
      to: selection.to + op.length,
      performedBy: selection.performedBy,
    };
  } else return selection;
};

const transformSD = (
  selection: TextSelection,
  op: TextOperation
): TextSelection => {
  const opEnd = op.position + op.length;

  // delete starts and ends before selection
  if (opEnd <= selection.from) {
    console.log('delete starts and ends before selection');
    return {
      docId: selection.docId,
      revision: selection.revision,
      from: selection.from - op.length,
      to: selection.to - op.length,
      performedBy: selection.performedBy,
    };
  }
  // delete starts before selection and ends in the middle of selection
  else if (
    op.position < selection.from &&
    opEnd > selection.from &&
    opEnd < selection.to
  ) {
    console.log(
      'delete starts before selection and ends in the middle of selection'
    );
    const overlapFromStartOfSelection = selection.from - op.position;
    return {
      docId: selection.docId,
      revision: selection.revision,
      from: selection.from - (op.length - overlapFromStartOfSelection),
      to: selection.to - overlapFromStartOfSelection,
      performedBy: selection.performedBy,
    };
  }
  // delete is inside of selection
  else if (op.position >= selection.from && op.position < selection.to) {
    console.log('delete is inside of selection');

    const toCut = Math.min(op.length, selection.to - op.position);

    return {
      docId: selection.docId,
      revision: selection.revision,
      from: selection.from,
      to: selection.to - toCut,
      performedBy: selection.performedBy,
    };
  } else {
    return selection;
  }
};
