import { TransferGame } from './Transfer';
import type { MiniGameProps } from './types';

/** Upload step of Transfer Data: bytes hop from your tablet up to the Admin cloud. */
export default function Upload(props: MiniGameProps) {
  return <TransferGame {...props} mode="upload" />;
}
