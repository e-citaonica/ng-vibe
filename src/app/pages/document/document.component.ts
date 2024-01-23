import {
  OperationAck,
  OperationWrapper,
  TextSelection,
} from '../../model/models';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
export class AppModule {}
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SocketIoService } from '../../services/socket-io.service';
import { DocumentService } from '../../services/document.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject, map, mergeMap, switchMap, takeUntil } from 'rxjs';
import { AngularMaterialModule } from '../../angular-material.module';
import { Editor } from '../../editor/editor';

@Component({
  selector: 'app-document',
  standalone: true,
  imports: [CommonModule, AngularMaterialModule, RouterModule],
  templateUrl: './document.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentComponent implements AfterViewInit, OnDestroy {
  http = inject(HttpClient);
  injector = inject(Injector);
  snackbar = inject(MatSnackBar);
  route = inject(ActivatedRoute);
  socketIOService = inject(SocketIoService);
  documentService = inject(DocumentService);

  @ViewChild('codeMirror') private cm!: ElementRef<HTMLDivElement>;

  editor = new Editor();
  destroy$ = new Subject<void>();

  constructor() {
    this.subscribeToSocketEvents();
    this.subscribeToEditorEvents();
  }

  subscribeToSocketEvents() {
    this.socketIOService.selection$
      .pipe(takeUntil(this.destroy$))
      .subscribe((selection) => {
        this.editor.documentBuffer.setSelection(selection);
        // TODO: Something smarter than manual update trigger
        this.editor.viewDispatch();
      });

    this.socketIOService.userLeave$
      .pipe(takeUntil(this.destroy$))
      .subscribe((payload) => {
        // TODO: Username or socketId?
        this.editor.documentBuffer.deleteSelection(payload.username);
        // TODO: Something smarter than manual update trigger
        this.editor.viewDispatch();
      });

    this.socketIOService.operation$
      .pipe(takeUntil(this.destroy$))
      .subscribe((incomingOp) => {
        this.editor.documentBuffer.transformPendingOperationsAgainstIncomingOperation(
          incomingOp
        );
        this.editor.documentBuffer.transformSelectionsAgainstIncomingOperation(
          incomingOp
        );
        this.editor.viewDispatch();

        this.editor.documentBuffer.doc.update((doc) => ({
          ...doc,
          revision: incomingOp.revision,
        }));

        this.applyOperation(incomingOp);
      });

    this.socketIOService.selection$
      .pipe(takeUntil(this.destroy$))
      .subscribe((selection) => {
        this.editor.documentBuffer.setSelection(selection);
      });

    this.socketIOService.userJoin$
      .pipe(takeUntil(this.destroy$))
      .subscribe((payload) => {
        this.snackbar.open(`${payload.username} joined!`, 'Info', {
          horizontalPosition: 'center',
          verticalPosition: 'top',
          duration: 3000,
          panelClass: ['green-snackbar'],
        });
      });
  }

  subscribeToEditorEvents() {
    this.editor.selection$
      .pipe(takeUntil(this.destroy$))
      .subscribe((selection) => {
        this.socketIOService.emit<TextSelection>('selection', selection);
      });

    this.editor.operation$
      .pipe(
        switchMap((operationWrapper) =>
          this.socketIOService.emitWithAck<OperationWrapper, OperationAck>(
            'operation',
            operationWrapper
          )
        ),
        takeUntil(this.destroy$)
      )
      .subscribe((ack) => {
        this.editor.ackHandler(ack);
      });
  }

  ngAfterViewInit(): void {
    const id = this.route.snapshot.params['id'];

    this.socketIOService
      .connect(id)
      .pipe(
        mergeMap((socketId) =>
          this.documentService.get(id).pipe(
            map((doc) => ({ socketId, doc })),
            takeUntil(this.destroy$)
          )
        )
      )
      .subscribe(({ socketId, doc }) => {
        this.editor.init(this.cm, doc, this.injector);

        this.editor.documentBuffer.doc.set(doc);

        this.socketIOService.userLeave$
          .pipe(takeUntil(this.destroy$))
          .subscribe((payload) => {
            this.snackbar.open(`${payload.username} left!`, 'Info', {
              horizontalPosition: 'center',
              verticalPosition: 'top',
              duration: 3000,
              panelClass: ['green-snackbar'],
            });

            this.editor.documentBuffer.deleteSelection(socketId);
          });
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.socketIOService.disconnect();
  }

  applyOperation(incomingOp: OperationWrapper) {
    this.editor.documentBuffer.applyOperation(incomingOp);

    if (incomingOp.operation.type === 'insert') {
      this.editor.viewDispatch({
        changes: {
          from: incomingOp.operation.position,
          insert: incomingOp.operation.operand!,
        },
      });
    } else {
      this.editor.viewDispatch({
        changes: {
          from: incomingOp.operation.position,
          to: incomingOp.operation.position + incomingOp.operation.length,
        },
      });
    }
  }
}
