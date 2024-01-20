import { TextOperation as TextOperation } from './models';

export const transformOperation = (
  op1: TextOperation,
  op2: TextOperation
): TextOperation[] => {
  if (op1.type === 'insert' && op2.type === 'insert') {
    return [transformII(op1, op2)];
  } else if (op1.type === 'insert' && op2.type === 'delete') {
    return [transformID(op1, op2)];
  } else if (op1.type === 'delete' && op2.type === 'insert') {
    return transformDI(op1, op2);
  } else if (op1.type === 'delete' && op2.type === 'delete') {
    return [transformDD(op1, op2)];
  } else {
    throw new Error('Transform failed');
  }
};

const transformII = (op1: TextOperation, op2: TextOperation): TextOperation => {
  const newPos =
    op1.position < op2.position ? op1.position : op1.position + op2.length;
  return {
    type: op1.type,
    operand: op1.operand,
    position: newPos,
    length: op1.length,
  };
};

const transformID = (op1: TextOperation, op2: TextOperation): TextOperation => {
  const op2End = op2.position + op2.length - 1;
  if (op1.position <= op2.position) {
    return {
      type: op1.type,
      operand: op1.operand,
      position: op1.position,
      length: op1.length,
    };
  } else if (op1.position <= op2End) {
    return {
      type: op1.type,
      operand: op1.operand,
      position: op2.position,
      length: op1.length,
    };
  } else {
    return {
      type: op1.type,
      operand: op1.operand,
      position: op1.position - op2.length,
      length: op1.length,
    };
  }
};

const transformDI = (
  op1: TextOperation,
  op2: TextOperation
): TextOperation[] => {
  const op1End = op1.position + op1.length - 1;
  if (op1.position < op2.position) {
    if (op1End < op2.position) {
      return [
        {
          type: op1.type,
          operand: op1.operand,
          position: op1.position,
          length: op1.length,
        },
      ];
    } else {
      const leftLength = op2.position - op1.position;
      const rightLength = op1.length - op2.position + op1.position;
      const left = op1.operand?.substring(0, leftLength);
      const right = op1.operand?.substring(leftLength);

      return [
        {
          type: op1.type,
          operand: left ?? null,
          position: op1.position,
          length: op2.position - op1.position,
        },
        {
          type: op1.type,
          operand: right ?? null,
          position: op1.position + leftLength + op2.length,
          length: rightLength,
        },
      ];
    }
  } else {
    return [
      {
        type: op1.type,
        operand: op1.operand,
        position: op1.position + op2.length,
        length: op1.length,
      },
    ];
  }
};

const transformDD = (op1: TextOperation, op2: TextOperation): TextOperation => {
  const op1End = op1.position + op1.length - 1;
  const op2End = op2.position + op2.length - 1;

  if (op1End < op2.position) {
    return {
      type: op1.type,
      operand: op1.operand,
      position: op1.position,
      length: op1.length,
    };
  } else if (op1.position > op2End) {
    return {
      type: op1.type,
      operand: op1.operand,
      position: op1.position - op2.length,
      length: op1.length,
    };
  } else if (op1.position < op2.position) {
    const operand = op1.operand?.substring(0, op2.position - op1.position);
    return {
      type: op1.type,
      operand: operand ?? null,
      position: op1.position,
      length: op2.position - op1.position,
    };
  } else if (op1End > op2End) {
    const diff = op1.position + op1.length - (op2.position + op2.length);
    const operand = op1.operand?.substring(op1.length - diff);
    return {
      type: op1.type,
      operand: operand ?? null,
      position: op2.position,
      length: diff,
    };
  } else {
    return op1;
  }
};
