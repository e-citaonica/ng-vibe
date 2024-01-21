import { OperationWrapper, TextOperation } from '../../model/models';
import { transformOperation } from '../../operation-transformations';
import { Queue } from '../../util/queue';

export class DocumentBuffer {
  private pendingChangesQueue = new Queue<OperationWrapper>();

  transformPendingOperationsAgainstIncomingOperation(
    incoming: OperationWrapper
  ) {
    this.pendingChangesQueue.print();
    this.pendingChangesQueue.flatMap((value) => {
      return transformOperation(value.operation, incoming.operation).map(
        (op) => ({ ...value, op })
      );
    });
    this.pendingChangesQueue.print();
  }

  updatePendingOperations(
    callbackfn: (operation: OperationWrapper) => OperationWrapper
  ) {
    this.pendingChangesQueue.flatMap(callbackfn);
  }

  enqueue(...ops: OperationWrapper[]) {
    for (const op of ops) {
      if (this.pendingChangesQueue.isNotEmpty()) {
        const last = this.pendingChangesQueue.peekLast();
        const { success, mergedOp } = this.tryMerge(
          last.operation,
          op.operation
        );

        if (success && mergedOp !== null) {
          console.log('merge', last, op, mergedOp);
          this.pendingChangesQueue.updateLast({ ...last, operation: mergedOp });
        } else {
          this.pendingChangesQueue.enqueue(op);
        }
      } else {
        this.pendingChangesQueue.enqueue(op);
      }
    }
  }

  dequeue(): OperationWrapper {
    return this.pendingChangesQueue.dequeue();
  }

  hasPending(): boolean {
    return this.pendingChangesQueue.isNotEmpty();
  }

  tryMerge(
    op1: TextOperation,
    op2: TextOperation
  ): { success: boolean; mergedOp: TextOperation | null } {
    if (op1.type != op2.type) return { success: false, mergedOp: null };

    if (op1.type === 'insert' && op1.position === op2.position - op1.length) {
      return {
        success: true,
        mergedOp: {
          type: op1.type,
          position: op1.position,
          operand: (op1.operand ?? '').concat(op2.operand ?? ''),
          length: op1.length + op2.length,
        },
      };
    } else if (
      op1.type === 'delete' &&
      op2.position === op1.position - op2.length
    ) {
      return {
        success: true,
        mergedOp: {
          type: op1.type,
          position: op2.position,
          operand: null,
          length: op1.length + op2.length,
        },
      };
    }

    return { success: false, mergedOp: null };
  }
}
