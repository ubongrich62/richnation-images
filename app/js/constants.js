// Investment packages and community rooms.
const ADMIN_CODE = 'RNADMIN2026';
const ADMIN_PASS = 'RNAAdmin@2026';

const PACKAGES = {
  premium:  { label: 'Premium Investor',       price: 'N3,000,000', badge: 'brand',  accent: 'premium',  rooms: ['welcome', 'my-channel', 'premium', 'general', 'qa', 'updates'] },
  standard: { label: 'Standard Investor',      price: 'N1,500,000', badge: 'blue',   accent: 'standard', rooms: ['welcome', 'my-channel', 'standard', 'general', 'qa', 'updates'] },
  special:  { label: 'Special Consideration',  price: 'N1,000,000', badge: 'purple', accent: 'special',  rooms: ['welcome', 'my-channel', 'special', 'general', 'qa', 'updates'] },
  training: { label: 'Training Program',       price: 'N100,000',   badge: 'green',  accent: 'training', rooms: ['welcome', 'my-channel', 'training', 'general', 'qa'] },
  admin:    { label: 'Administrator',          price: 'All Access', badge: 'brand',  accent: 'premium',  rooms: ['welcome', 'premium', 'standard', 'special', 'training', 'general', 'qa', 'updates', 'admin'] }
};

const ROOMS = [
  { id: 'welcome',    label: 'Welcome & Rules',       desc: 'Start here',                    icon: '👋' },
  { id: 'my-channel', label: 'My Channel',            desc: 'Talk to management privately',  icon: '📺' },
  { id: 'premium',    label: 'Premium Investors',     desc: 'N3M package members',           icon: '💎' },
  { id: 'standard',   label: 'Standard Investors',    desc: 'N1.5M package members',         icon: '📊' },
  { id: 'special',    label: 'Special Members',       desc: 'N1M package members',           icon: '⭐' },
  { id: 'training',   label: 'Training Program',      desc: 'N100K learning track',          icon: '🎓' },
  { id: 'general',    label: 'General Discussion',    desc: 'All members',                   icon: '💬' },
  { id: 'qa',         label: 'Q&A with Management',   desc: 'Ask questions directly',        icon: '❓' },
  { id: 'updates',    label: 'Channel Updates',       desc: 'Progress & milestones',         icon: '📈' },
  { id: 'admin',      label: 'Admin Panel',           desc: 'Management only',               icon: '🛠️', adminOnly: true }
];
