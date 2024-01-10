type Operation = {
  type: 'insert' | 'delete';
  operand: string | null;
  position: number;
  length: number;
};

export type OperationWrapper = {
  docId: string;
  revision: number;
  ackTo: string;
  operation: Operation;
};
