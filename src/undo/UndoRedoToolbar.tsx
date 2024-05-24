import { UndoController } from './useUndo';
import { Undo as UndoIcon, Redo as RedoIcon } from '@mui/icons-material';

export function UndoRedoToolbar<T>({ controller }: { controller: UndoController<T>; }) {
    return <div>
        <button disabled={!controller.canUndo()} onClick={controller.undo} className="btn btn-success btn-sm">
            <UndoIcon />
            {' '}Undo
        </button>
        {' '}
        <button disabled={!controller.canRedo()} onClick={controller.redo} className="btn btn-success btn-sm">
            Redo
            {' '}<RedoIcon />
        </button>
    </div>;
}
