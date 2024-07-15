import React, { Ref } from 'react';

const equal = (a: DOMRect, b: DOMRect) => {
  return a.x === b.x
    && a.y === b.y
    && a.width === b.width
    && a.height === b.height;
}

export const useElementSize = (): [
  DOMRect,
  Ref<HTMLDivElement>
 ] => {
  const containerRef = React.createRef<HTMLDivElement>();
  const [domRect,setDomRect] = React.useState<DOMRect>(new DOMRect(0,0,0,0));

  React.useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const container = containerRef.current!;
    const update = () => {
      const rect = container.getBoundingClientRect();
      if(equal(domRect,rect)){
        return;
      }
      console.log('container size update',rect);
      setDomRect(rect);
    };

    window.addEventListener('resize',update);
    update();
    return () => {
      window.removeEventListener('resize',update);
    };
  }, [containerRef]);
  return [
    domRect, 
    containerRef
  ];
}

export const useContainerSize = (): {
  containerRef: Ref<HTMLDivElement>;
  height: number;
  width: number;
} => {
  const containerRef = React.createRef<HTMLDivElement>();
  const [domRect,setDomRect] = React.useState<DOMRect>(new DOMRect(0,0,0,0));

  React.useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const container = containerRef.current!;
    const update = () => {
      const rect = container.getBoundingClientRect();
      if(equal(domRect,rect)){
        return;
      }
      console.log('container size update',rect);
      setDomRect(rect);
    };

    window.addEventListener('resize',update);
    update();
    return () => {
      window.removeEventListener('resize',update);
    };
  }, [containerRef]);
  return {
    containerRef,
    height: domRect.height,
    width: domRect.width
  };
}

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