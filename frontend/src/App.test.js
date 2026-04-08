import { render, screen } from '@testing-library/react';
import App from './App';

test('renders app header', () => {
  render(<App />);
  const heading = screen.getByText(/Enterprise User Management/i);
  expect(heading).toBeInTheDocument();
});
