import { Button } from '@mui/material';
import { UndoController } from './useUndo';
import { Undo as UndoIcon, Redo as RedoIcon } from '@mui/icons-material';

export function UndoRedoToolbar<T>({ controller }: { controller: UndoController<T>; }) {
    const space = <>&nbsp;</>;
    return <div>
        <Button disabled={!controller.canUndo()} onClick={controller.undo}>
            <UndoIcon />{space}Undo
        </Button>
        <Button disabled={!controller.canRedo()} onClick={controller.redo}>
            Redo{space}<RedoIcon />
        </Button>
    </div>;
}
