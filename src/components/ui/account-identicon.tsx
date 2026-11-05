// Deterministic visual identifier only; never use an avatar to verify an address.
export function AccountIdenticon({ address }: { address: string }) {
  let seed = 2166136261;
  for (const character of address.toLowerCase()) {
    seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  const hue = seed % 360;
  const background = `hsl(${hue} 75% 86%)`;
  const foreground = `hsl(${(hue + 40) % 360} 70% 38%)`;
  const accent = `hsl(${(hue + 180) % 360} 80% 56%)`;
  const cells = [];
  for (let row = 0; row < 5; row++) {
    for (let column = 0; column < 3; column++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      const value = seed >>> 0;
      if (value % 3 === 0) continue;
      const fill = value % 3 === 1 ? foreground : accent;
      cells.push(<rect key={`${row}-${column}`} x={5 + column * 5} y={5 + row * 5} width="5" height="5" rx="1" fill={fill} />);
      if (column < 2) cells.push(<rect key={`${row}-${4 - column}`} x={5 + (4 - column) * 5} y={5 + row * 5} width="5" height="5" rx="1" fill={fill} />);
    }
  }
  return <span className="account-identicon" aria-hidden="true">
    <svg width="24" height="24" viewBox="0 0 35 35" fill="none">
      <circle cx="17.5" cy="17.5" r="17.5" fill={background} />
      {cells}
    </svg>
  </span>;
}
