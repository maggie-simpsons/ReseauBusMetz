import { useColorScheme } from 'react-native';

const light = {
  dark: false,
  bg: '#f4f5f7',
  card: '#ffffff',
  text: '#16181d',
  muted: '#6b7280',
  border: '#e3e5ea',
  primary: '#0b6bcb',
  primaryText: '#ffffff',
  chip: '#eceef2',
  danger: '#c62828',
  warn: '#d97706',
  warnBg: '#fff7e6',
  live: '#16a34a',
  late: '#c2410c',
};

const dark = {
  dark: true,
  bg: '#0f1115',
  card: '#1a1d23',
  text: '#eef0f3',
  muted: '#9aa1ad',
  border: '#2a2e36',
  primary: '#4f9cf0',
  primaryText: '#0b1220',
  chip: '#262a32',
  danger: '#ef5350',
  warn: '#f0a43a',
  warnBg: '#2b2316',
  live: '#34d399',
  late: '#fb923c',
};

export function useColors() {
  return useColorScheme() === 'dark' ? dark : light;
}
