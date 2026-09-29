// Test users, in one place. Tests import what they need.
export type User = { email: string; password: string; name: string };

export const student: User = {
  email: 'student@qa.academy',
  password: 'Learn@123',
  name: 'Student',
};

export const wrongPassword: User = {
  email: 'student@qa.academy',
  password: 'not-my-password',
  name: 'Student',
};
