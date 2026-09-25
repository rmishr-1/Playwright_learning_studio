import type { Page, Locator } from '@playwright/test';

// A page object: everything tests need to know about the sign-in page, in one place
export class SignInPage {
  // Properties: the page, and the locators for its elements
  readonly page: Page;
  readonly emailField: Locator;
  readonly passwordField: Locator;
  readonly signInButton: Locator;
  readonly message: Locator;

  // The constructor runs once, when a test writes: new SignInPage(page)
  constructor(page: Page) {
    this.page = page;
    this.emailField = page.getByLabel('Email');
    this.passwordField = page.getByLabel('Password');
    this.signInButton = page.getByRole('button', { name: 'Sign in' });
    this.message = page.getByRole('alert');
  }

  // Methods: the actions a user can take here
  async goto(): Promise<void> {
    await this.page.goto('/signin');
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.emailField.fill(email);
    await this.passwordField.fill(password);
    await this.signInButton.click();
  }
}
