import { TransferGame } from './Transfer';
import type { MiniGameProps } from './types';

/** Download step of Transfer Data: bytes hop from the HQ server to your tablet. */
export default function Download(props: MiniGameProps) {
  return <TransferGame {...props} mode="download" />;
}
