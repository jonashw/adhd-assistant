import { Button, Stack, Typography } from "@mui/material";
import React from "react";

function imgSourceToCanvas(element: HTMLVideoElement | HTMLImageElement): OffscreenCanvas {
    //'onplaying' in element ? element.onpl
    const canvas =
        'videoWidth' in element
            ? new OffscreenCanvas(element.videoWidth, element.videoWidth)
            : new OffscreenCanvas(element.width, element.height);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(element, 0, 0);
    console.log(element, canvas);
    return canvas;
}

export const Webcam = React.forwardRef(function (
    {
        onFrame
    }: {
        onFrame: (osc: OffscreenCanvas) => void;
    },
    ref
) {
    const videoElementRef = React.useRef<HTMLVideoElement>(null);
    const [videoDevices,setVideoDevices] = React.useState<MediaDeviceInfo[]>([]);
    const [selectedVideoDevice,setSelectedVideoDevice] = React.useState<MediaDeviceInfo>();

    React.useEffect(() => {
        navigator.mediaDevices.enumerateDevices().then(devices => {
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            setVideoDevices(videoDevices.reverse());
            console.log({videoDevices});
            const preferredVideoDevice =
                videoDevices.find(d => 
                    /* AFAICT, there is no way to do the equivalent logical 
                    ** test when enumerating devices directly (`facingMode` is not a property of `MediaDeviceInfo`):
                    **        navigator.mediaDevices.getUserMedia({video: { facingMode: { exact: "environment" } }}
                    ** So, we have to emulate this query in order to arrive at a preferred device.
                    ** The pro of this approach is that we know which of the multiple video devices we are selecting 
                    ** and can show the user this fact if/when they wish to change the selected device.
                    ** (AFAICT, there is no way to know which device was chosen when using `getUserMedia`.  )*/
                       d.label.indexOf('facing back') > -1 
                    || d.label.indexOf('back facing') > -1
                ) ?? videoDevices.find(() => true);
            if(preferredVideoDevice !== undefined){
                setSelectedVideoDevice(preferredVideoDevice);
            } else {
                alert('no video input device found');
            }
        }); 
    },[]);

    React.useEffect(() => {
        if (!videoElementRef.current) {
            console.log('no video element yet');
            return;
        }
        if(!selectedVideoDevice){
            console.log('no selected video device');
            return;
        }
        const video = videoElementRef.current!;
        let stream: MediaStream;

        const init = async () => {
            console.log('preparing video stream');
            stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    deviceId: {exact: selectedVideoDevice.deviceId}
                }
            });
            video.autoplay = true;
            video.srcObject = stream;
            video.onplaying = () => {
                console.log('started playing', video);
            };
        };

        init();

        function cleanupStream(stream: MediaStream){
            console.log('cleanup stream')
            //reference: https://stackoverflow.com/a/12436772/943730
            for (const track of stream.getTracks()) {
                track.stop();
            }
        }

        return () => {
            console.log('cleanup')
            video.onplaying = null;
            if (stream !== undefined) {
                cleanupStream(stream);
            }
        };
    }, [onFrame, videoElementRef, selectedVideoDevice]);

    React.useImperativeHandle(ref, () => {
        return {
            capture: () => new Promise(resolve => {
                if (!videoElementRef.current) {
                    console.log('no video element yet');
                    return Promise.resolve();
                }
                const video = videoElementRef.current!;

                resolve(imgSourceToCanvas(video));
            })
        };
    });

    const capture = () => {
        if (!videoElementRef.current) {
            console.log('no video element yet');
            return;
        }
        const video = videoElementRef.current!;
        onFrame(imgSourceToCanvas(video));
    };

    const videoElement = React.useMemo(() => 
        <video
            onClick={capture}
            style={{ maxWidth: '100%', cursor: 'pointer' }}
            key={"THE VIDEO STREAM"}
            ref={videoElementRef}
        />, []);

    return (
        <div>
            <div>Click/tap the video to capture</div>
            {videoElement}
            {videoDevices.length > 1 && (
                <Stack direction={"row"} justifyContent={"space-between"} gap={2} alignItems={"center"}>
                    <Typography>
                        Video devices:
                    </Typography>
                    {videoDevices.map((d,i) => 
                        <Button
                            key={d.deviceId}
                            sx={{flexGrow:1}}
                            size="small"
                                title={JSON.stringify(d,null,2)}
                                variant={d === selectedVideoDevice ? "contained" : "outlined"}
                                onClick={() => setSelectedVideoDevice(d)}
                        >
                            {i+1}
                        </Button>)}
                </Stack>
            )}
        </div>
    );
});