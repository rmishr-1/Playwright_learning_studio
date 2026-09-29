import { test, expect } from '@playwright/test';
import { EnrolPage } from '../../pages/EnrolPage';
import { serveQaAcademy } from '../../utils/practice-site';
import { asha, noAtSign, enrolMessages } from '../../test-data/enrolments';

test.describe('Enrolment', { tag: '@enrol' }, () => {
  let enrolPage: EnrolPage;

  test.beforeEach(async ({ page }) => {
    await serveQaAcademy(page);
    enrolPage = new EnrolPage(page);
    await enrolPage.goto();
  });

  test('student can enrol in a course', { tag: '@smoke' }, async () => {
    await enrolPage.enrol(asha);

    await test.step('Confirmation and seat count', async () => {
      await expect(enrolPage.status).toHaveText('Thanks, Asha! You are enrolled in API Testing.');
      await expect(enrolPage.seats).toHaveText('Seats left: 11');
    });
  });

  test('an email without @ is rejected', async () => {
    await enrolPage.enrol(noAtSign);
    await expect(enrolPage.status).toHaveText(enrolMessages.invalidEmail);
    await expect(enrolPage.seats).toHaveText('Seats left: 12');
  });

  test('a name is required', async () => {
    await enrolPage.enrol({ fullName: '', email: 'asha@example.com', course: 'API Testing' });
    await expect(enrolPage.status).toHaveText(enrolMessages.nameRequired);
  });

  test('enrol button needs the terms', async () => {
    await expect(enrolPage.enrolButton).toBeDisabled();
    await enrolPage.termsCheckbox.check();
    await expect(enrolPage.enrolButton).toBeEnabled();
  });
});
