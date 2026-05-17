interface WaveDividerProps {
  topColor: string;
  bottomColor: string;
  flip?: boolean;
}

export function WaveDivider({ topColor, bottomColor, flip = false }: WaveDividerProps) {
  return (
    <div
      className="relative w-full overflow-hidden leading-[0]"
      style={{ background: topColor }}
    >
      <svg
        viewBox="0 0 1440 60"
        preserveAspectRatio="none"
        className="block w-full"
        style={{
          height: "60px",
          transform: flip ? "scaleY(-1)" : "none",
          display: "block",
        }}
        aria-hidden="true"
      >
        <path
          d="M0,30 C240,5 480,55 720,30 C960,5 1200,50 1440,25 L1440,60 L0,60 Z"
          fill={bottomColor}
        />
      </svg>
    </div>
  );
}
