import type { Page, Locator } from '@playwright/test';
import type { Enrolment } from '../test-data/enrolments';

// Page object for the course enrolment page
export class EnrolPage {
  readonly page: Page;
  readonly nameField: Locator;
  readonly emailField: Locator;
  readonly courseList: Locator;
  readonly termsCheckbox: Locator;
  readonly enrolButton: Locator;
  readonly status: Locator;
  readonly seats: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nameField = page.getByLabel('Full name');
    this.emailField = page.getByLabel('Email');
    this.courseList = page.getByLabel('Course');
    this.termsCheckbox = page.getByRole('checkbox', { name: 'I accept the terms' });
    this.enrolButton = page.getByRole('button', { name: 'Enrol now' });
    this.status = page.getByRole('status');
    this.seats = page.getByTestId('seats');
  }

  async goto(): Promise<void> {
    await this.page.goto('/enrol');
  }

  // Fill the whole form, accept the terms and submit
  async enrol(enrolment: Enrolment): Promise<void> {
    await this.nameField.fill(enrolment.fullName);
    await this.emailField.fill(enrolment.email);
    await this.courseList.selectOption(enrolment.course);
    await this.termsCheckbox.check();
    await this.enrolButton.click();
  }
}
