import type { Card } from '../types/card';
import { qrImage } from '../app/queries';

export function getQrImage(card: Card): string {
  return qrImage(card);
}
