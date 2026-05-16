import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SettingsSoundPage } from './settings-sound.page';

describe('SettingsSoundPage', () => {
  let component: SettingsSoundPage;
  let fixture: ComponentFixture<SettingsSoundPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SettingsSoundPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
