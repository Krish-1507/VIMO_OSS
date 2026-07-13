import { ConnectorPack } from '../types';

export const reviewMonitoringPack: ConnectorPack = {
  id: 'review-monitoring',
  name: 'Review Monitoring',
  icon: 'Star',
  brandColor: 'from-yellow-500 to-amber-600',
  description: 'Monitor reviews and turn ratings into content.',
  longDescription: 'Track reviews across platforms, respond to feedback, and turn positive reviews into social proof content.',
  difficulty: 'Easy',
  estimatedSetupTime: '2 minutes',
  category: 'intelligence_packs',
  provider: 'review-monitoring',
  connectionType: 'none',
  requirements: [
    { id: 'reviews', label: 'My business has reviews online', checked: false },
  ],
  capabilities: [
    { icon: 'Star', label: 'Monitor reviews' },
    { icon: 'BarChart3', label: 'Track ratings' },
    { icon: 'MessageCircle', label: 'Surface feedback' },
    { icon: 'Megaphone', label: 'Share testimonials' },
  ],
  whatVimoLearns: [
    { icon: 'Star', label: 'Review Ratings' },
    { icon: 'BarChart3', label: 'Rating Trends' },
    { icon: 'MessageCircle', label: 'Customer Feedback' },
    { icon: 'AlertCircle', label: 'Issue Alerts' },
  ],
  whatVimoGenerates: [
    { icon: 'Megaphone', label: 'Testimonial Posts' },
    { icon: 'FileText', label: 'Social Proof Content' },
    { icon: 'BarChart3', label: 'Review Summaries' },
    { icon: 'Heart', label: 'Customer Stories' },
  ],
  steps: [
    {
      id: 'welcome',
      type: 'verify_requirements',
      title: 'Review Monitoring',
      description: 'VIMO monitors your reviews and helps turn positive feedback into content.',
      requirements: [
        { id: 'reviews', label: 'My business has reviews online', checked: false },
      ],
    },
    {
      id: 'setup',
      type: 'instructions',
      title: 'Configure Review Monitoring',
      description: 'Tell VIMO which platforms have your reviews so we can track them.',
      instructionBullets: [
        'Enter your review profile URLs below (one per line)',
        'VIMO monitors ratings, feedback, and sentiment trends',
        'Positive reviews become testimonial social content',
        'Get alerts when negative issues need attention',
      ],
    },
    {
      id: 'credentials',
      type: 'paste_credentials',
      title: 'Enter Your Review Profiles',
      description: 'Paste the URLs of your business profiles on review platforms.',
      credentialFields: [
        { key: 'reviewPlatforms', label: 'Review Profile URLs', placeholder: 'https://g.page/your-business\nhttps://yelp.com/biz/your-business\nhttps://trustpilot.com/review/yourcompany.com', isSecret: false, helpText: 'One per line — URLs to your Google Business, Yelp, Trustpilot, or other review profiles' },
      ],
    },
  ],
  helpArticles: [
    {
      id: 'how_reviews',
      question: 'How does Review Monitoring work?',
      answer: 'VIMO monitors your online reviews, analyzes sentiment, and helps you turn positive feedback into social proof content for your marketing.',
    },
  ],
  validationRules: [],
  discoveredInfo: {
    title: 'Review Monitoring active. VIMO is tracking:',
    items: [
      { icon: 'Star', label: 'Average rating', value: '4.5' },
      { icon: 'BarChart3', label: 'Total reviews', value: 'Detecting...' },
      { icon: 'Heart', label: 'Positive reviews', value: 'Ready to share' },
    ],
  },
  successActions: [
    { label: 'Create testimonial posts from reviews', cta: 'Create Posts', route: '/content' },
    { label: 'View review summary dashboard', cta: 'Open Dashboard', route: '/intelligence' },
    { label: 'Turn reviews into social proof', cta: 'Generate Content', route: '/content' },
  ],
  exampleOutputs: [
    'Social posts featuring your best reviews',
    'Weekly review summary reports',
    'Testimonial graphics for social media',
    'Customer satisfaction trend analysis',
  ],
};
