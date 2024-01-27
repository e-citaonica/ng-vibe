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
import { Subject, map, mergeMap, switchMap, take, takeUntil } from 'rxjs';
import { AngularMaterialModule } from '../../angular-material.module';
import { Editor } from '../../editor/editor';
import { AnnotationType } from '@codemirror/state';

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
        this.editor.documentState.setSelection(selection);
        // TODO: Something smarter than manual update trigger
        this.editor?.viewDispatch();
      });

    this.socketIOService.userLeave$
      .pipe(takeUntil(this.destroy$))
      .subscribe((payload) => {
        // TODO: Username or socketId?
        this.editor.documentState.deleteSelection(payload.username);
        // TODO: Something smarter than manual update trigger
        this.editor.viewDispatch();
      });

    this.socketIOService.operation$
      .pipe(takeUntil(this.destroy$))
      .subscribe((incomingOp) => {
        this.editor.documentState.transformPendingOperationsAgainstIncomingOperation(
          incomingOp.operation
        );
        this.editor.documentState.transformSelectionsAgainstIncomingOperation(
          incomingOp.operation
        );
        this.editor.viewDispatch();

        this.editor.documentState.doc.update((doc) => ({
          ...doc,
          revision: incomingOp.revision,
        }));

        this.applyOperation(incomingOp);
      });

    this.socketIOService.selection$
      .pipe(takeUntil(this.destroy$))
      .subscribe((selection) => {
        this.editor.documentState.setSelection(selection);
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

    this.socketIOService.userLeave$
      .pipe(takeUntil(this.destroy$))
      .subscribe((payload) => {
        this.snackbar.open(`${payload.username} left!`, 'Info', {
          horizontalPosition: 'center',
          verticalPosition: 'top',
          duration: 3000,
          panelClass: ['green-snackbar'],
        });

        this.editor.documentState.deleteSelection(payload.sessionId);
      });
  }

  subscribeToEditorEvents() {
    this.editor.selection$
      .pipe(takeUntil(this.destroy$))
      .subscribe((selection) => {
        this.socketIOService.emit<TextSelection>('selection', selection);
      });

    this.editor.dequeuedOperation$
      .pipe(
        takeUntil(this.destroy$),
        switchMap((operationWrapper) =>
          this.socketIOService.emitWithAck<OperationWrapper, OperationAck>(
            'operation',
            operationWrapper
          )
        )
      )
      .subscribe((ack) => {
        if (ack.revision === -1) {
          this.documentService
            .get(this.editor.documentState.doc().id)
            .subscribe((doc) => {
              this.editor.setDocument(doc);
            });
        } else {
          console.log(ack);
          this.editor.ackHandler(ack);
        }
      });
  }

  ngAfterViewInit(): void {
    const id = this.route.snapshot.params['id'];

    this.socketIOService
      .connect(id)
      .pipe(
        mergeMap((socketId) =>
          this.documentService.get(id).pipe(map((doc) => ({ socketId, doc })))
        )
      )
      .pipe(take(1))
      .subscribe(({ socketId, doc }) => {
        this.editor.init(this.cm, doc, this.injector);
      });
  }

  ngOnDestroy(): void {
    this.editor.dispose();
    this.destroy$.next();
    this.socketIOService.disconnect();
  }

  applyOperation(incomingOp: OperationWrapper) {
    console.log(incomingOp);
    this.editor.documentState.applyOperation(incomingOp);

    if (incomingOp.operation.type === 'insert') {
      this.editor.viewDispatch({
        changes: {
          from: incomingOp.operation.position,
          insert: incomingOp.operation.operand!,
        },
      });
    } //else {
    //   this.editor.viewDispatch({
    //     changes: {
    //       from: incomingOp.operation.position,
    //       to: incomingOp.operation.position + incomingOp.operation.length,
    //     },
    //   });
    // }
  }
}
