import React, { Ref } from 'react';

export const useContainerHeight = (): { containerRef: Ref<HTMLDivElement>; availableHeight: number; } => {
  const containerRef = React.createRef<HTMLDivElement>();
  const [availableHeight, setAvailableHeight] = React.useState(0);
  React.useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const container = containerRef.current!;
    const update = () => {
      setAvailableHeight(container.clientHeight);
    };

    window.addEventListener('resize',update);
    update();
    return () => {
      window.removeEventListener('resize',update);
    };
  }, [containerRef]);
  return { availableHeight, containerRef };
};

export const useContainerWidth = (): { containerRef: Ref<HTMLDivElement>; availableWidth: number; } => {
  const containerRef = React.createRef<HTMLDivElement>();
  const [availableWidth, setAvailableWidth] = React.useState(0);
  React.useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const container = containerRef.current!;
    const update = () => {
      setAvailableWidth(container.clientWidth);
    };

    window.addEventListener('resize',update);
    update();
    return () => {
      window.removeEventListener('resize',update);
    };
  }, [containerRef]);
  return { availableWidth, containerRef };
};