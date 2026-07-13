import React from 'react';
import * as Icons from 'lucide-react';

export function resolveIcon(iconName: string): React.ElementType {
  const map = Icons as unknown as Record<string, React.ElementType>;
  const Icon = map[iconName];
  return Icon || Icons.Circle;
}
