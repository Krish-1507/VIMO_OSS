export type DifficultyLevel = 'Easy' | 'Medium' | 'Hard';
export type PackCategory = 'social_accounts' | 'knowledge_packs' | 'intelligence_packs' | 'creative_commerce';

export type ConnectorStatus = 'connected' | 'available' | 'recommended';
export type SetupStepType = 
  | 'verify_requirements'
  | 'open_external'
  | 'instructions'
  | 'show_credentials_location'
  | 'paste_credentials'
  | 'test_connection'
  | 'success'
  | 'discovery'
  | 'oauth_connect';

export interface Requirement {
  id: string;
  label: string;
  checked: boolean;
}

export interface Capability {
  icon: string; // lucide icon name
  label: string;
}

export interface HelpArticle {
  id: string;
  question: string;
  answer: string;
  link?: { url: string; label: string };
}

export interface ValidationRule {
  field: string;
  validate: (value: string) => { valid: boolean; message?: string };
}

export interface SetupStep {
  id: string;
  type: SetupStepType;
  title: string;
  description: string;
  screenshotPlaceholder?: string;
  helpArticleIds?: string[];
  // For verify_requirements
  requirements?: Requirement[];
  // For open_external
  externalUrl?: string;
  externalButtonLabel?: string;
  // For instructions
  instructionBullets?: string[];
  // For show_credentials_location / paste_credentials
  credentialFields?: CredentialField[];
  // For test_connection
  testChecks?: { label: string; key: string }[];
  // For discovery
  discoveryItems?: { icon: string; label: string; value: string }[];
}

export interface CredentialField {
  key: string;
  label: string;
  placeholder: string;
  isSecret: boolean;
  helpText?: string;
}

export interface DiscoveredInfo {
  title: string;
  items: { icon: string; label: string; value: string }[];
}

export interface SuccessAction {
  label: string;
  cta: string;
  route?: string;
}

/**
 * What VIMO learns from this pack after connection.
 */
export interface VimoLearns {
  icon: string;
  label: string;
}

/**
 * What VIMO can generate/create using this pack's data.
 */
export interface VimoGenerates {
  icon: string;
  label: string;
}

export interface ConnectorPack {
  id: string;
  name: string;
  icon: string; // lucide icon name
  brandColor: string; // tailwind gradient e.g. 'from-pink-500 to-purple-600'
  description: string;
  longDescription?: string;
  difficulty: DifficultyLevel;
  estimatedSetupTime: string; // e.g. '3 minutes'
  category: PackCategory;
  
  // Simple requirements checklist shown before setup
  requirements: Requirement[];
  
  // What VIMO can do after connection
  capabilities: Capability[];
  
  // What VIMO learns from this pack (shown prominently on the card)
  whatVimoLearns: VimoLearns[];
  
  // What VIMO can generate using this pack
  whatVimoGenerates: VimoGenerates[];
  
  // Setup steps for the TurboTax-style assistant
  steps: SetupStep[];
  
  // Help articles for the setup assistant
  helpArticles: HelpArticle[];
  
  // Validation rules for credential fields
  validationRules: ValidationRule[];
  
  // Maps to backend provider
  provider: string;
  
  // Connection type
  connectionType: 'oauth' | 'oauth_manual' | 'api_key' | 'app_password' | 'none';
  
  // Auto-discovered data shown immediately after connection
  discoveredInfo?: DiscoveredInfo;
  
  // Suggested actions after successful connection
  successActions?: SuccessAction[];
  
  // Post-connection metrics (legacy)
  postConnectionValue?: {
    title: string;
    metrics: { label: string; value: string; icon: string }[];
    suggestedAction: { label: string; cta: string };
  };
  
  // Whether this is a "popular" pack
  isPopular?: boolean;
  
  // Example outputs for the detail modal
  exampleOutputs?: string[];
}

export interface ConnectorPackState {
  pack: ConnectorPack;
  status: ConnectorStatus;
  connectedAt?: string;
  credentials?: Record<string, string>;
}
