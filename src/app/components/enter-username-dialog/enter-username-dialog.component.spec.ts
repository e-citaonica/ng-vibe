import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EnterUsernameDialogComponent } from './enter-username-dialog.component';

describe('EnterUsernameDialogComponent', () => {
  let component: EnterUsernameDialogComponent;
  let fixture: ComponentFixture<EnterUsernameDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EnterUsernameDialogComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(EnterUsernameDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
