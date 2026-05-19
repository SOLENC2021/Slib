import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: true,
  theme: 'base',
  themeVariables: {
    primaryColor: '#4f46e5',
    primaryTextColor: '#fff',
    primaryBorderColor: '#4f46e5',
    lineColor: '#6366f1',
    secondaryColor: '#f8f9fc',
    tertiaryColor: '#fff',
    fontSize: '14px',
    fontFamily: '"Inter", sans-serif',
  },
  securityLevel: 'loose',
});

interface MermaidProps {
  chart: string;
}

const Mermaid: React.FC<MermaidProps> = ({ chart }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && chart) {
      ref.current.removeAttribute('data-processed');
      mermaid.contentLoaded();
    }
  }, [chart]);

  useEffect(() => {
    // Initial render
    mermaid.contentLoaded();
  }, []);

  return (
    <div className="mermaid flex justify-center w-full" ref={ref}>
      {chart}
    </div>
  );
};

export default Mermaid;
