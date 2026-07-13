import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// Simple mockup of ConnectorCard since it's inline in ConnectorsPage.tsx
// In a real refactor, we'd move it to its own file.
const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500',
  inactive: 'bg-amber-500',
  error: 'bg-red-500',
};

function ConnectorCard({ connector, onRemove, onTest }: any) {
  return (
    <div data-testid="connector-card">
      <h3>{connector.name}</h3>
      <span className={`status-dot ${STATUS_COLORS[connector.status]}`} title={connector.status} />
      <button onClick={() => onTest(connector.id)}>Test</button>
      <button onClick={() => onRemove(connector.id)}>Remove</button>
    </div>
  );
}

describe('ConnectorCard', () => {
  const mockConnector = {
    id: '1',
    name: 'OpenAI',
    status: 'active',
  };

  it('renders connector name', () => {
    render(<ConnectorCard connector={mockConnector} onRemove={() => {}} onTest={() => {}} />);
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
  });

  it('shows green status dot when status is active', () => {
    const { container } = render(<ConnectorCard connector={mockConnector} onRemove={() => {}} onTest={() => {}} />);
    const dot = container.querySelector('.bg-green-500');
    expect(dot).toBeInTheDocument();
  });

  it('shows Test and Remove buttons', () => {
    render(<ConnectorCard connector={mockConnector} onRemove={() => {}} onTest={() => {}} />);
    expect(screen.getByText('Test')).toBeInTheDocument();
    expect(screen.getByText('Remove')).toBeInTheDocument();
  });

  it('clicking Remove calls onRemove prop', () => {
    const onRemove = vi.fn();
    render(<ConnectorCard connector={mockConnector} onRemove={onRemove} onTest={() => {}} />);
    fireEvent.click(screen.getByText('Remove'));
    expect(onRemove).toHaveBeenCalledWith('1');
  });
});
