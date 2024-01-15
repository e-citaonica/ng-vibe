import { Document } from './document/document.model';

export type Operation = {
  type: 'insert' | 'delete';
  operand: string | null;
  position: number;
  length: number;
};

export type OperationWrapper = {
  docId: string;
  revision: number;
  performedBy: string;
  operation: Operation;
};

export type OperationAck = Pick<Document, 'revision'>;

export type Selection = {
  docId: string;
  from: number;
  to: number;
  performedBy: string;
};

export type UserJoinedPayload = {
  socketId: string;
  username: string;
};
