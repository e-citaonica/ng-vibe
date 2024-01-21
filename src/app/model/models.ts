import { Document } from './document.model';

export type TextOperation = {
  type: 'insert' | 'delete';
  operand: string | null;
  position: number;
  length: number;
};

export type OperationWrapper = {
  docId: string;
  revision: number;
  performedBy: string;
  operation: TextOperation;
};

export type OperationAck = Pick<Document, 'revision'>;

export type TextSelection = {
  docId: string;
  revision: number;
  from: number;
  to: number;
  performedBy: string;
};

export type UserInfo = {
  docId: string;
  sessionId: string;
  username: string;
};
