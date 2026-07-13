import { ConnectorPack } from '../types';

export const customerFeedbackPack: ConnectorPack = {
  id: 'customer-feedback',
  name: 'Customer Feedback',
  icon: 'MessageCircle',
  brandColor: 'from-purple-500 to-pink-500',
  description: 'Understand what your customers are saying.',
  longDescription: 'Aggregate customer feedback from reviews, surveys, and social mentions. VIMO turns insights into content and product improvements.',
  difficulty: 'Easy',
  estimatedSetupTime: '2 minutes',
  category: 'intelligence_packs',
  provider: 'customer-feedback',
  connectionType: 'none',
  requirements: [
    { id: 'feedback', label: 'I want to understand customer sentiment', checked: false },
  ],
  capabilities: [
    { icon: 'MessageCircle', label: 'Monitor feedback' },
    { icon: 'Heart', label: 'Track sentiment' },
    { icon: 'Lightbulb', label: 'Surface insights' },
    { icon: 'TrendingUp', label: 'Identify trends' },
  ],
  whatVimoLearns: [
    { icon: 'MessageCircle', label: 'Customer Sentiment' },
    { icon: 'Heart', label: 'Positive Feedback' },
    { icon: 'AlertCircle', label: 'Pain Points' },
    { icon: 'TrendingUp', label: 'Feature Requests' },
  ],
  whatVimoGenerates: [
    { icon: 'Megaphone', label: 'Testimonials' },
    { icon: 'FileText', label: 'Case Studies' },
    { icon: 'Lightbulb', label: 'Product Improvements' },
    { icon: 'BarChart3', label: 'Sentiment Reports' },
  ],
  steps: [
    {
      id: 'welcome',
      type: 'verify_requirements',
      title: 'Customer Feedback',
      description: 'VIMO monitors customer feedback across channels to help you understand sentiment and create better content.',
      requirements: [
        { id: 'feedback', label: 'I want to understand customer sentiment', checked: false },
      ],
    },
    {
      id: 'setup',
      type: 'instructions',
      title: 'Configure Feedback Sources',
      description: 'Tell VIMO where to look for customer feedback and sentiment.',
      instructionBullets: [
        'Enter your review platform profiles and survey sources below',
        'VIMO monitors reviews, social mentions, and survey responses',
        'Feedback is analyzed for sentiment and key themes',
        'Positive feedback is turned into testimonials and social proof',
      ],
    },
    {
      id: 'credentials',
      type: 'paste_credentials',
      title: 'Enter Feedback Sources',
      description: 'Enter URLs or names of your review platforms, survey tools, and feedback channels.',
      credentialFields: [
        { key: 'feedbackSources', label: 'Feedback Sources', placeholder: 'https://g.page/your-business\nhttps://trustpilot.com/your-company\nSurveyMonkey: Customer Satisfaction', isSecret: false, helpText: 'One per line — URLs to your review profiles, survey tools, or feedback platforms' },
      ],
    },
  ],
  helpArticles: [
    {
      id: 'how_feedback',
      question: 'How does Customer Feedback work?',
      answer: 'VIMO aggregates feedback from multiple sources, analyzes sentiment, and surfaces actionable insights. It turns positive feedback into content.',
    },
  ],
  validationRules: [],
  discoveredInfo: {
    title: 'Customer Feedback active. VIMO is monitoring:',
    items: [
      { icon: 'Heart', label: 'Sentiment score', value: 'Positive' },
      { icon: 'MessageCircle', label: 'Feedback sources', value: 'Multiple' },
      { icon: 'Lightbulb', label: 'Insights found', value: 'Analyzing...' },
    ],
  },
  successActions: [
    { label: 'View sentiment dashboard', cta: 'Open Insights', route: '/intelligence' },
    { label: 'Create testimonial content', cta: 'Create Content', route: '/content' },
    { label: 'Turn feedback into case studies', cta: 'Write Case Study', route: '/content' },
  ],
  exampleOutputs: [
    'Weekly customer sentiment reports',
    'Testimonial content for social media',
    'Case studies based on positive feedback',
    'Product improvement suggestions from pain points',
  ],
};
