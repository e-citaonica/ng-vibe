import { Signal, signal } from '@angular/core';
import {
  OperationWrapper,
  TextOperation,
  TextSelection,
} from '../model/models';
import { transformOperation } from './transformations/operation-transformations';
import { transformSelection } from './transformations/selection-transformations';
import { Queue } from './util/queue';
import { Document } from '../model/document.model';

export class DocumentBuffer {
  private _pendingChangesQueue = new Queue<OperationWrapper>();
  private _selections = signal(new Map<string, TextSelection>());

  readonly doc = signal<Document>({
    id: '',
    content: 'Loading...',
    name: 'Loading...',
    revision: -1,
  });

  get selections() {
    return this._selections.asReadonly();
  }

  transformPendingOperationsAgainstIncomingOperation(
    incoming: OperationWrapper
  ) {
    this._pendingChangesQueue.print();
    this._pendingChangesQueue.flatMap((value) => {
      return transformOperation(value.operation, incoming.operation).map(
        (op) => ({ ...value, op })
      );
    });
    this._pendingChangesQueue.print();
  }

  transformSelectionsAgainstIncomingOperation(incoming: OperationWrapper) {
    for (const [username, selection] of this._selections().entries()) {
      const before = selection;
      const transformedSelection = transformSelection(
        selection,
        incoming.operation
      );
      this._selections.update(
        (selections) => new Map(selections.set(username, transformedSelection))
      );
      const after = transformedSelection;
      console.log({ before, after });
    }
  }

  setSelection(selection: TextSelection) {
    this._selections.update(
      (selections) => new Map(selections.set(selection.performedBy, selection))
    );
  }

  deleteSelection(socketId: string) {
    this._selections.update((selections) => {
      selections.delete(socketId);
      return new Map(selections);
    });
  }

  updatePendingOperations(
    callbackfn: (operation: OperationWrapper) => OperationWrapper
  ) {
    this._pendingChangesQueue.flatMap(callbackfn);
  }

  enqueue(...ops: OperationWrapper[]) {
    for (const op of ops) {
      if (this._pendingChangesQueue.isNotEmpty()) {
        const last = this._pendingChangesQueue.peekLast();
        const mergedOp = this.tryMerge(last.operation, op.operation);

        if (mergedOp !== null) {
          console.log('merge', last, op, mergedOp);
          this._pendingChangesQueue.updateLast({
            ...last,
            operation: mergedOp,
          });
        } else {
          this._pendingChangesQueue.enqueue(op);
        }
      } else {
        this._pendingChangesQueue.enqueue(op);
      }
    }
  }

  dequeue(): OperationWrapper {
    return this._pendingChangesQueue.dequeue();
  }

  hasPending(): boolean {
    return this._pendingChangesQueue.isNotEmpty();
  }

  tryMerge(op1: TextOperation, op2: TextOperation): TextOperation | null {
    if (op1.type !== op2.type) return null;

    if (op1.type === 'insert' && op1.position === op2.position - op1.length) {
      return {
        type: op1.type,
        position: op1.position,
        operand: (op1.operand ?? '').concat(op2.operand ?? ''),
        length: op1.length + op2.length,
      };
    } else if (
      op1.type === 'delete' &&
      op2.position === op1.position - op2.length
    ) {
      return {
        type: op1.type,
        position: op2.position,
        operand: null,
        length: op1.length + op2.length,
      };
    }

    return null;
  }

  applyOperation(incomingOp: OperationWrapper) {
    if (incomingOp.operation.type === 'insert') {
      this.setSelection({
        docId: incomingOp.docId,
        revision: incomingOp.revision,
        performedBy: incomingOp.performedBy,
        from: incomingOp.operation.position + incomingOp.operation.length,
        to: incomingOp.operation.position + incomingOp.operation.length,
      });
    } else {
      this.setSelection({
        docId: incomingOp.docId,
        revision: incomingOp.revision,
        performedBy: incomingOp.performedBy,
        from: incomingOp.operation.position,
        to: incomingOp.operation.position,
      });
    }
  }
}
