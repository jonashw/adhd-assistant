import React from "react";

export function useLocalStorage<T>(
    defaultValue: T,
    storageKey: string,
    serialize: (value: T) => string,
    deserialize: (str: string) => T
): [ T, (newValue:T) => void ] {
    const str = localStorage.getItem(storageKey);
    const actualValue = !str ? defaultValue : deserialize(str);
    const [state,setState] = React.useState<T>(actualValue);
    const setValue = (value: T) => {
        localStorage.setItem(storageKey, serialize(value));
        setState(value);
    }
    return [state,setValue];
}