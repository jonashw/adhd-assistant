import { Button, Hidden } from '@mui/material';
import { UndoController } from './useUndo';
import { Undo as UndoIcon, Redo as RedoIcon } from '@mui/icons-material';

export function UndoRedoToolbar<T>({ controller }: { controller: UndoController<T>; }) {
    const space = <>&nbsp;</>;
    return <>
        {([
            [<UndoIcon/>,"Undo",controller.canUndo, controller.undo],
            ["Redo",<RedoIcon/>,controller.canRedo, controller.redo]
        ] as [
            React.JSX.Element|string,
            React.JSX.Element|string,
            () => boolean,
            () => void
        ][]).map(([a,b,canDo,doIt],i) => 
            <Button disabled={!canDo()} onClick={doIt} variant="contained" color="info" key={i}>
                {typeof a === 'string' 
                    ? <Hidden smDown>{a}{space}</Hidden> 
                    : <>{a}</>
                }
                {typeof b === 'string' 
                    ? <Hidden smDown>{space}{b}</Hidden> 
                    : <>{b}</>}
            </Button>
        )}
    </>;
}
