import type { WeatherKind } from '@orbit/shared';
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  type LucideIcon,
  Snowflake,
  Sun,
} from 'lucide-react';

export const weatherIcons: Record<WeatherKind, LucideIcon> = {
  clear: Sun,
  cloudy: Cloud,
  fog: CloudFog,
  rain: CloudRain,
  snow: Snowflake,
  storm: CloudLightning,
};
