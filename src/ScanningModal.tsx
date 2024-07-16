import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { Webcam } from "./Webcam";

export default function ScanningModal({
    open,
    onClose
}:{
    open: boolean;
    onClose: (value?: Blob) => void;
}){

    return (
        <Dialog
            open={open}
            onClose={() => {
                onClose();
            }}
        >
            <DialogTitle>Scan a physical graph</DialogTitle>
            <DialogContent>
                <div style={{marginBottom:'1em'}}>
                    <Webcam onFrame={osc => {
                        osc.convertToBlob().then(onClose);
                    }}/>
                </div>

                <Typography gutterBottom>
                    Or upload a photo: 
                    {' '}
                    <input
                        type="file"
                        accept="image/*" 
                        onChange={async e => {
                            const file = e.target.files?.item(0);
                            if(!file){
                                return;
                            }
                            console.log('new file',file);
                            onClose(file);
                        }}
                    />
                </Typography>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => { onClose(); }}>Cancel</Button>
                <Button type="submit">OK</Button>
            </DialogActions>
        </Dialog>
    );
}