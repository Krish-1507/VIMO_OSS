import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Toast from '../components/ui/Toast';
import { useUIStore } from '../stores/uiStore';

// Mock the store
vi.mock('../stores/uiStore', () => ({
  useUIStore: vi.fn(),
}));

describe('ToastNotification', () => {
  it('renders notification title and message', () => {
    const mockNotifications = [
      { id: '1', type: 'success', title: 'Success', message: 'It worked!' },
    ];
    (useUIStore as any).mockImplementation((selector: any) => 
      selector({ notifications: mockNotifications, removeNotification: vi.fn() })
    );

    render(<Toast />);
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('It worked!')).toBeInTheDocument();
  });

  it('dismiss button calls removeNotification', () => {
    const removeNotification = vi.fn();
    const mockNotifications = [
      { id: '1', type: 'success', title: 'Success', message: 'It worked!' },
    ];
    
    (useUIStore as any).mockImplementation((selector: any) => {
      const state = { notifications: mockNotifications, removeNotification };
      return typeof selector === 'function' ? selector(state) : state;
    });

    render(<Toast />);
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(removeNotification).toHaveBeenCalledWith('1');
  });
});
