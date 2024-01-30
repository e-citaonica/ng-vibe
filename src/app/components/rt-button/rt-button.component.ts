import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-rt-button',
  standalone: true,
  imports: [],
  templateUrl: './rt-button.component.html'
})
export class RtButtonComponent {
  @Input('type') type: 'submit' | 'button' | 'menu' | 'rest' = 'button';
  @Output('onClick') onClick = new EventEmitter<void>();
}
