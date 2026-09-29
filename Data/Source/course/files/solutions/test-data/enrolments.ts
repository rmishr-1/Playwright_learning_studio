// Test data for the enrolment page
export type Enrolment = { fullName: string; email: string; course: string };

export const asha: Enrolment = {
  fullName: 'Asha Verma',
  email: 'asha@example.com',
  course: 'API Testing',
};

export const noAtSign: Enrolment = {
  fullName: 'Ravi Kumar',
  email: 'ravi.example.com',
  course: 'Playwright Basics',
};

export const enrolMessages = {
  nameRequired: 'Name is required',
  invalidEmail: 'Enter a valid email',
  chooseCourse: 'Please choose a course',
};
