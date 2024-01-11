import { Document } from './document.model';

export type Operation = {
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

export type OperationAck = Pick<Document, 'revision'>;
