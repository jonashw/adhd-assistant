import React from "react";

function imgSourceToCanvas(element: HTMLVideoElement | HTMLImageElement): OffscreenCanvas{
    //'onplaying' in element ? element.onpl
    const canvas = 
        'videoWidth' in element
        ? new OffscreenCanvas(element.videoWidth, element.videoWidth)
        : new OffscreenCanvas(element.width, element.height);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(element,0,0);
    console.log(element,canvas);
    return canvas;
}

export const Webcam = React.forwardRef(function ({
  onFrame
}: {
  onFrame: (osc: OffscreenCanvas) => void;
},ref) {
  const videoElementRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    if (!videoElementRef.current) {
      console.log('no video element yet');
      return;
    }
    const video = videoElementRef.current!;
    let stream: MediaStream;
    const init = async () => {
      console.log('preparing video stream');
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      video.autoplay = true;
      video.srcObject = stream;
      video.onplaying = () => {
        console.log('started playing', video);
      };
    };

    init();

    return () => {
      console.log('cleanup')
      video.onplaying = null;
      if(stream){
        //reference: https://stackoverflow.com/a/12436772/943730
        for(const track of stream.getTracks()){
          track.stop();
        }
      }
    };
  }, [onFrame, videoElementRef]);

  const capture = () => {
    if (!videoElementRef.current) {
      console.log('no video element yet');
      return;
    }
    const video = videoElementRef.current!;
    onFrame(imgSourceToCanvas(video));
  };

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

  const videoElement = React.useMemo(() => {
    //console.log('rendering video element');
    return (
      <video 
        style={{maxWidth:'100%'}}
        key={"THE VIDEO STREAM"}
        ref={videoElementRef}
      />
    );
  }, []);

  return (<div 
    style={{cursor:'pointer'}}
    onClick={capture}
  >
    {videoElement}
    <div>Click/tap the video to capture</div>
  </div>);
});