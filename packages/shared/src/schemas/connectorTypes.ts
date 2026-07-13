export const VIMO_CONNECTOR_TYPES = [
  'social',
  'llm',
  'analytics',
  'crm',
  'productivity',
  'ecommerce',
  'custom',
  'media_generation',
] as const;

export type VIMOConnectorType = (typeof VIMO_CONNECTOR_TYPES)[number];

