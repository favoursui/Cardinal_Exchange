"use client";

import Image from 'next/image';
import { useState } from 'react';
import styles from './wallet.module.css';

// EIP-6963 icons are self-contained image data URIs. Never inject their SVG markup.
export function walletIconSource(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= 262_144 &&
    /^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml)(?:;[^,]*)?,/i.test(value) ? value : undefined;
}

export function WalletLogo({ source }: { source?: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return <span className={styles.icon} aria-hidden="true">
    {source && failedSource !== source ? <Image src={source} alt="" width={32} height={32} unoptimized
      onError={() => setFailedSource(source)} /> : <span>◈</span>}
  </span>;
}
