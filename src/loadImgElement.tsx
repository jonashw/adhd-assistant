export const loadImgElement = (src: string): Promise<HTMLImageElement> => new Promise((resolve, _) => {
    let img = new Image();
    img.onload = () => {
        resolve(img);
    };
    img.src = src;
});
