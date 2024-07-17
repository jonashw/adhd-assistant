import React from "react";

export type CircularArray<T> = {
    currentItem: T | undefined
    prev: () => void,
    next: () => void
};

export function useCircularArray<T>(items: T[] | Promise<T[]>): CircularArray<T> {
    const [currentIndex, setCurrentIndex] = React.useState<number>(0);
    const [actualItems, setActualItems] = React.useState<T[]>([]);
    const currentItem = React.useMemo(() => actualItems[currentIndex], [actualItems, currentIndex]);

    React.useEffect(() => {
        console.log('items changed',items);
        if ('then' in items) {
            items.then(setActualItems);
        } else {
            setActualItems(items);
        }
    }, [items]);

    const move = (di: number) => {
        let i = currentIndex + di;
        if (i >= actualItems.length) {
            i = 0;
        } else if (i < 0) {
            i = actualItems.length - 1;
        }
        console.log('move to ', i, ' by ', di);
        setCurrentIndex(i);
    };
    React.useEffect(() => {
        console.log('actualItems changed');
    },[actualItems]);
    React.useEffect(() => {
        console.log('currentItem changed');
    },[currentItem]);
    return React.useMemo(() => ({
        prev: () => move(-1),
        next: () => move(1),
        currentItem
    } as CircularArray<T>), [actualItems,currentItem]);
}
