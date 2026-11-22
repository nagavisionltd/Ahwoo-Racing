import React from 'react';

interface CountdownOverlayProps {
  text: string;
}

export const CountdownOverlay: React.FC<CountdownOverlayProps> = ({ text }) => {
  return (
    <div className="fixed inset-0 z-30 pointer-events-none flex items-center justify-center">
      <div
        key={text}
        className="countdown-pop text-[clamp(88px,15vw,190px)] font-black italic leading-none text-white"
        style={{
          textShadow: '0 0 28px #00f0ff, 6px 6px 0 #f5c451'
        }}
      >
        {text}
      </div>
    </div>
  );
};
