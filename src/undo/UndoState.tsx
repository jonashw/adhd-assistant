export type UndoState<T> = {
    prev: T[];
    curr: T;
    next: T[];
};
