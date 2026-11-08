/**
 * "Where to get help" resources shown by Ask Vaie for topics it must NOT advise on.
 *
 * TODO(before demo): VERIFY EVERY NUMBER BELOW against an official government source
 * (e.g. the issuing ministry's website) on the day of the demo. Numbers change.
 * Leave `phone` undefined rather than guessing; the card then shows the label only.
 */
import type { Category } from '../lib/types';

export type Resource = {
  title: string; // English; translated at runtime
  body: string;
  phone?: string; // dialled with Linking tel:
  phoneLabel?: string;
  icon: string; // MaterialCommunityIcons name
  color: string;
};

export const RESOURCES: Partial<Record<Category, Resource[]>> = {
  legal: [
    {
      title: 'Free legal aid (District Legal Services Authority)',
      body: 'Visit your District Legal Services Authority (DLSA) office or call the NALSA legal aid helpline for free legal help.',
      phone: '15100', // TODO verify: NALSA national legal aid helpline
      phoneLabel: 'NALSA helpline 15100',
      icon: 'scale-balance',
      color: '#2F6690',
    },
  ],
  financial: [
    {
      title: 'Your bank branch or post office',
      body: 'Ask at your own bank branch or post office counter. Never share your OTP, PIN or password with anyone. Scammers are common.',
      icon: 'bank',
      color: '#2E7D4F',
    },
    {
      title: 'National Consumer Helpline',
      body: 'For complaints about products, services or unfair charges.',
      phone: '1915', // TODO verify: National Consumer Helpline
      phoneLabel: 'Consumer helpline 1915',
      icon: 'account-voice',
      color: '#2E7D4F',
    },
    {
      title: 'Cyber fraud helpline',
      body: 'If you were cheated online or by phone, report it quickly.',
      phone: '1930', // TODO verify: National Cyber Crime helpline
      phoneLabel: 'Cyber fraud 1930',
      icon: 'shield-alert',
      color: '#B3261E',
    },
  ],
  health: [
    {
      title: 'Primary Health Centre (PHC), doctor or ASHA worker',
      body: 'Please visit your nearest Primary Health Centre or a doctor, or talk to your village ASHA worker. For an emergency, call 108.',
      phone: '108', // TODO verify: ambulance
      phoneLabel: 'Ambulance 108',
      icon: 'hospital-building',
      color: '#C8553D',
    },
  ],
  mental_health: [
    {
      title: 'Tele-MANAS (free mental health support)',
      body: 'Free, confidential support by phone, any time, in many Indian languages.',
      phone: '14416', // TODO verify: Tele-MANAS
      phoneLabel: 'Tele-MANAS 14416',
      icon: 'heart-pulse',
      color: '#3D9A8B',
    },
  ],
  emergency: [
    {
      title: 'Emergency: call 112',
      body: 'Police, fire and ambulance. If you can, ask someone near you to help right now.',
      phone: '112', // TODO verify: national emergency number
      phoneLabel: 'Emergency 112',
      icon: 'phone-alert',
      color: '#B3261E',
    },
    {
      title: 'Ambulance',
      body: 'For medical emergencies.',
      phone: '108', // TODO verify: ambulance
      phoneLabel: 'Ambulance 108',
      icon: 'ambulance',
      color: '#C8553D',
    },
    {
      title: 'Tele-MANAS (someone to talk to)',
      body: 'If you are thinking of hurting yourself, please call. You are not alone.',
      phone: '14416', // TODO verify: Tele-MANAS
      phoneLabel: 'Tele-MANAS 14416',
      icon: 'heart-pulse',
      color: '#3D9A8B',
    },
  ],
};
